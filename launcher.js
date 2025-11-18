<script>
    const launcherGrid = document.getElementById('launcherGrid');
    const editButton = document.getElementById('editButton');
    const modeToggle = document.getElementById('modeToggle');
    const backupLinks = document.querySelector('.backup-links');
    let editMode = false;
    const shortcuts = loadShortcuts();

    function saveTheme(theme) {
        document.cookie = `theme=${theme}; path=/; max-age=31536000`; // Save for 1 year
    }

    function loadTheme() {
        const matches = document.cookie.match(/(?:^|; )theme=([^;]*)/);
        return matches ? decodeURIComponent(matches[1]) : 'light'; // Default to 'light'
    }

    function toggleTheme() {
        const currentTheme = document.body.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.body.setAttribute('data-theme', newTheme);
        saveTheme(newTheme);
    }

    document.body.setAttribute('data-theme', loadTheme());

    function saveShortcuts() {
        document.cookie = "shortcuts=" + JSON.stringify(shortcuts) + "; path=/";
    }

    function loadShortcuts() {
        const matches = document.cookie.match(new RegExp(
            "(?:^|; )" + "shortcuts".replace(/([\.$?*|{}\\\\\\/\\+^])/g, '\\$1') + "=([^;]*)"
        ));
        return matches ? JSON.parse(decodeURIComponent(matches[1])) : [
            { name: 'Gmail', url: 'https://mail.google.com', iconUrl: 'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico', description: 'Access Gmail' },
            { name: 'Photos', url: 'https://photos.google.com', iconUrl: 'https://ssl.gstatic.com/images/branding/product/1x/photos_64dp.png', description: 'View Photos' },
            { name: 'Drive', url: 'https://drive.google.com', iconUrl: 'https://ssl.gstatic.com/images/branding/product/1x/drive_2020q4_64dp.png', description: 'Open Drive' },
            { name: 'Docs', url: 'https://docs.google.com', iconUrl: 'https://ssl.gstatic.com/images/branding/product/1x/docs_2020q4_64dp.png', description: 'Edit Documents' },
            { name: 'Sheets', url: 'https://sheets.google.com', iconUrl: 'https://ssl.gstatic.com/images/branding/product/1x/sheets_2020q4_64dp.png', description: 'Edit Sheets' }
        ];
    }

    function renderShortcuts() {
        launcherGrid.innerHTML = '';
        shortcuts.forEach((shortcut, index) => {
            const icon = document.createElement('div');
            icon.className = 'icon';
            icon.innerHTML = `
                <img src="https://file-hosting.dashnexpages.net/inriris/${shortcut.iconUrl}" alt="${shortcut.name} Icon">
                <span>${shortcut.name}</span>
                <div class="tooltip">${shortcut.description}</div>
                <div class="edit-buttons">
                    <button onclick="editShortcut(${index})" aria-label="Edit ${shortcut.name}">Edit</button>
                    <button onclick="deleteShortcut(${index})" aria-label="Delete ${shortcut.name}">Delete</button>
                </div>
            `;
            icon.onclick = () => {
                if (!editMode) {
                    window.open(shortcut.url, '_blank');
                }
            };
            launcherGrid.appendChild(icon);
        });

        if (editMode) {
            const addIcon = document.createElement('div');
            addIcon.className = 'icon';
            addIcon.innerHTML = `<span>Add new</span>`;
            addIcon.onclick = addShortcut;
            launcherGrid.appendChild(addIcon);
        }
    }

    function toggleEditMode() {
        editMode = !editMode;
        document.body.classList.toggle('edit-mode', editMode);
        editButton.textContent = editMode ? 'Done' : 'Edit';
        backupLinks.style.display = editMode ? 'block' : 'none'; // Show/hide backup links
        renderShortcuts();
    }

    function editShortcut(index) {
        const shortcut = shortcuts[index];
        const newName = prompt('Edit Name', shortcut.name);
        if (newName !== null) shortcut.name = newName;
        const newUrl = prompt('Edit URL', shortcut.url);
        if (newUrl !== null) shortcut.url = newUrl;
        const newIconUrl = prompt('Edit Icon URL', shortcut.iconUrl);
        if (newIconUrl !== null) shortcut.iconUrl = newIconUrl;
        const newDescription = prompt('Edit Description', shortcut.description);
        if (newDescription !== null) shortcut.description = newDescription;
        saveShortcuts();
        renderShortcuts();
    }

    function deleteShortcut(index) {
        shortcuts.splice(index, 1);
        saveShortcuts();
        renderShortcuts();
    }

    function addShortcut() {
        const name = prompt('Enter Name');
        const url = prompt('Enter URL');
        const iconUrl = prompt('Enter Icon URL');
        const description = prompt('Enter Description');
        if (name && url && iconUrl) {
            shortcuts.push({ name, url, iconUrl, description });
            saveShortcuts();
            renderShortcuts();
        }
    }

    function backupShortcuts() {
        const backupData = {
            theme: document.body.getAttribute('data-theme'),
            shortcuts: shortcuts
        };
        const shortcutsBackup = JSON.stringify(backupData);
        const blob = new Blob([shortcutsBackup], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'shortcuts_backup.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function restoreShortcuts() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (event) => {
                const content = event.target.result;
                try {
                    const restoredData = JSON.parse(content);
                    shortcuts.length = 0; // Clear existing shortcuts
                    shortcuts.push(...restoredData.shortcuts);
                    saveShortcuts();
                    document.body.setAttribute('data-theme', restoredData.theme); // Restore theme
                    saveTheme(restoredData.theme); // Save restored theme in cookies
                    renderShortcuts();
                    alert('Shortcuts and theme restored successfully!');
                } catch (error) {
                    alert('Failed to restore shortcuts. Please ensure the file is a valid JSON.');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    function powerWash() {
        if (confirm('This will erase all custom shortcuts. Are you sure you want to continue?')) {
            document.cookie = "shortcuts=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
            document.cookie = "theme=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
            location.reload();
        }
    }

    editButton.onclick = toggleEditMode;
    modeToggle.onclick = toggleTheme;
    renderShortcuts();
</script>