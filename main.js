const { Plugin, MarkdownView, PluginSettingTab, Setting, Notice, moment, normalizePath } = require('obsidian');

const DEFAULT_SETTINGS = {
    enableAutoReadingMode: true,
    disableCopying: false,
    highlightAsUnderline: false
};

module.exports = class DailyNotesTweaksPlugin extends Plugin {
    async onload() {
        await this.loadSettings();

        this.addCommand({
            id: 'open-random-daily-note',
            name: 'Open random daily note',
            callback: () => {
                this.openRandomDailyNote();
            }
        });

        if (this.settings.enableAutoReadingMode) {
            this.registerEvent(
                this.app.workspace.on('file-open', async (file) => {
                    if (!file || !file.path.endsWith('.md')) return;

                    if (!this.isCurrentDailyNote(file.path)) {
                        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                        if (activeView) {
                            await this.switchToReadingMode(activeView);
                        }
                    }
                })
            );
        }

        if (this.settings.disableCopying) {
            this.enableCopyProtection();
        }

        this.addSettingTab(new DailyNotesTweaksSettingTab(this.app, this));
    }

    enableCopyProtection() {
        this.copyHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            new Notice('Copying is disabled');
            return false;
        };

        this.cutHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            new Notice('Cutting is disabled');
            return false;
        };

        this.contextMenuHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            return false;
        };

        this.registerDomEvent(document, 'copy', this.copyHandler, true);
        this.registerDomEvent(document, 'cut', this.cutHandler, true);
        this.registerDomEvent(document, 'contextmenu', this.contextMenuHandler, true);

        this.beforeCopyHandler = (e) => {
            e.preventDefault();
            return false;
        };
        this.registerDomEvent(document, 'beforecopy', this.beforeCopyHandler, true);
    }

    disableCopyProtection() {
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    getDailyNoteConfiguration() {
        const instance = this.app.internalPlugins.getPluginById('daily-notes')?.instance;
        if (instance) {
            let folder = instance.options?.folder || '';
            if (folder === '/' || folder === '\\') folder = '';
            return {
                format: instance.options?.format || 'YYYY-MM-DD',
                folder: folder,
                template: instance.options?.template
            };
        }
        return {
            format: 'YYYY-MM-DD',
            folder: '',
            template: undefined
        };
    }

    getCurrentDailyNotePath() {
        const config = this.getDailyNoteConfiguration();
        const dateFormat = config.format;
        const noteFolder = config.folder;

        const currentDate = moment();
        const formattedFilename = currentDate.format(dateFormat);

        const path = noteFolder
            ? `${noteFolder}/${formattedFilename}.md`
            : `${formattedFilename}.md`;

        return normalizePath(path);
    }

    isCurrentDailyNote(filePath = null) {
        if (!filePath) {
            const activeFile = this.app.workspace.getActiveFile();
            if (!activeFile) return false;
            filePath = activeFile.path;
        }

        const todayNotePath = this.getCurrentDailyNotePath();
        return normalizePath(filePath) === todayNotePath;
    }

    isDailyNote(filePath) {
        const config = this.getDailyNoteConfiguration();
        const noteFolder = config.folder;
        const dateFormat = config.format;

        const normalizedFilePath = normalizePath(filePath);
        const normalizedFolder = noteFolder ? normalizePath(noteFolder) : '';

        if (normalizedFolder) {
            if (!normalizedFilePath.startsWith(normalizedFolder + '/')) {
                return false;
            }
        }

        const fileBasename = normalizedFilePath.split('/').pop().replace('.md', '');

        try {
            const parsedDate = moment(fileBasename, dateFormat, true);
            return parsedDate.isValid();
        } catch (error) {
            return false;
        }
    }

    getAllDailyNotes() {
        const config = this.getDailyNoteConfiguration();
        const noteFolder = config.folder;
        const normalizedFolder = noteFolder ? normalizePath(noteFolder) : '';

        let allMarkdownFiles = this.app.vault.getMarkdownFiles();

        if (normalizedFolder) {
            allMarkdownFiles = allMarkdownFiles.filter(file =>
                normalizePath(file.path).startsWith(normalizedFolder + '/')
            );
        }

        const dailyNoteFiles = allMarkdownFiles.filter(file => this.isDailyNote(file.path));
        return dailyNoteFiles;
    }

    async openRandomDailyNote() {
        const allDailyNotes = this.getAllDailyNotes();

        if (allDailyNotes.length === 0) {
            new Notice('No daily notes found');
            return;
        }

        const currentFile = this.app.workspace.getActiveFile();
        let availableNotes = allDailyNotes;

        if (currentFile && allDailyNotes.includes(currentFile)) {
            availableNotes = allDailyNotes.filter(note => note.path !== currentFile.path);
        }

        if (availableNotes.length === 0) {
            new Notice('Only one daily note exists');
            return;
        }

        const randomIndex = Math.floor(Math.random() * availableNotes.length);
        const selectedNote = availableNotes[randomIndex];

        const workspaceLeaf = this.app.workspace.getLeaf();
        await workspaceLeaf.openFile(selectedNote);

        if (!this.isCurrentDailyNote(selectedNote.path) && this.settings.enableAutoReadingMode) {
            const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (markdownView) {
                await this.switchToReadingMode(markdownView);
            }
        }
    }

    async switchToReadingMode(view) {
        if (!view) return;

        let viewState = view.leaf.getViewState();
        if (viewState.state?.mode !== 'preview') {
            viewState.state.mode = 'preview';
            await view.leaf.setViewState(viewState);
        }
    }

    onunload() {}
}

class DailyNotesTweaksSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;

        containerEl.empty();

        new Setting(containerEl)
            .setName('Auto reading mode')
            .setDesc('Automatically switch to reading mode when opening past daily notes.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableAutoReadingMode)
                .onChange(async (value) => {
                    this.plugin.settings.enableAutoReadingMode = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Disable copying')
            .setDesc('Prevent copying text via keyboard shortcuts and context menu')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.disableCopying)
                .onChange(async (value) => {
                    this.plugin.settings.disableCopying = value;
                    await this.plugin.saveSettings();
                    new Notice('Please reload the plugin for changes to take effect');
                }));

        new Setting(containerEl)
            .setName('Highlight as underline')
            .setDesc('Replace highlight background with underline style.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.highlightAsUnderline)
                .onChange(async (value) => {
                    this.plugin.settings.highlightAsUnderline = value;
                    await this.plugin.saveSettings();
                    new Notice('Please reload the plugin for changes to take effect');
                }));
    }
}
