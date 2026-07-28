export async function loadUIComponents() {
    const container = document.getElementById('modals-container');
    if (!container) return;

    // Danh sách các component HTML nhỏ cần nạp
    const componentUrls = [
        './src/components/settings-modal.html',
        './src/components/lorebook-modal.html',
        './src/components/gdrive-modal.html',
        './src/components/audio-modal.html',
        './src/components/srs-modal.html',
        './src/components/find-replace-modal.html',
        './src/components/export-modal.html',
        './src/components/preview-modal.html'
    ];

    try {
        const htmlChunks = await Promise.all(
            componentUrls.map(url =>
                fetch(url).then(res => {
                    if (!res.ok) throw new Error(`Không thể nạp component: ${url}`);
                    return res.text();
                })
            )
        );

        // Chèn toàn bộ HTML Modals vào hộp chứa
        container.innerHTML = htmlChunks.join('\n');
    } catch (err) {
        console.error("Lỗi khi nạp UI Components:", err);
    }
}