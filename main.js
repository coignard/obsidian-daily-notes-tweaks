const { Plugin, MarkdownView, PluginSettingTab, Setting, Notice } = require('obsidian');

const DEFAULT_SETTINGS = {
    enableAutoReadingMode: true
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

        this.addSettingTab(new DailyNotesTweaksSettingTab(this.app, this));
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    getDailyNoteConfiguration() {
        const dailyNotesPlugin = this.app.internalPlugins.plugins['daily-notes']?.instance?.options;
        if (dailyNotesPlugin) {
            return {
                format: dailyNotesPlugin.format || 'YYYY-MM-DD',
                folder: dailyNotesPlugin.folder || '',
                template: dailyNotesPlugin.template
            };
        }

        const vaultConfig = this.app.vault.config;
        return {
            format: vaultConfig?.dailyNoteFormat || 'YYYY-MM-DD',
            folder: vaultConfig?.dailyNoteFolder || '',
            template: vaultConfig?.dailyNoteTemplate
        };
    }

    getCurrentDailyNotePath() {
        const config = this.getDailyNoteConfiguration();
        const dateFormat = config.format;
        const noteFolder = config.folder;

        const currentDate = window.moment();
        const formattedFilename = currentDate.format(dateFormat);

        if (noteFolder && noteFolder !== '/' && noteFolder !== '') {
            return noteFolder + '/' + formattedFilename + '.md';
        } else {
            return formattedFilename + '.md';
        }
    }

    isCurrentDailyNote(filePath = null) {
        if (!filePath) {
            const activeFile = this.app.workspace.getActiveFile();
            if (!activeFile) return false;
            filePath = activeFile.path;
        }

        const todayNotePath = this.getCurrentDailyNotePath();
        return filePath === todayNotePath;
    }

    isDailyNote(filePath) {
        const config = this.getDailyNoteConfiguration();
        const noteFolder = config.folder;
        const dateFormat = config.format;

        if (noteFolder && noteFolder !== '/' && noteFolder !== '') {
            if (!filePath.startsWith(noteFolder + '/')) {
                return false;
            }
        }

        const fileBasename = filePath.split('/').pop().replace('.md', '');

        try {
            const parsedDate = window.moment(fileBasename, dateFormat, true);
            return parsedDate.isValid();
        } catch (error) {
            return false;
        }
    }

    getAllDailyNotes() {
        const config = this.getDailyNoteConfiguration();
        const noteFolder = config.folder;

        let allMarkdownFiles = this.app.vault.getMarkdownFiles();

        if (noteFolder && noteFolder !== '/' && noteFolder !== '') {
            allMarkdownFiles = allMarkdownFiles.filter(file => file.path.startsWith(noteFolder + '/'));
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
    }
}
