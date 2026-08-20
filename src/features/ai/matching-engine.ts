// 5-Layer Bulletproof Translation Matching Engine

export function matchTranslationsToBlocks(blocks: any[], rawResponseData: any): any[] {
    if (!Array.isArray(blocks) || blocks.length === 0) return blocks || [];

    const rawList = Array.isArray(rawResponseData?.blocks)
        ? rawResponseData.blocks
        : (Array.isArray(rawResponseData?.translations)
            ? rawResponseData.translations
            : (Array.isArray(rawResponseData) ? rawResponseData : []));

    const mapById = new Map<string, string>();
    const mapByOriginal = new Map<string, string>();
    const listByOrder: string[] = [];

    rawList.forEach((item: any) => {
        if (!item) return;
        const rawStr = (item.translated || item.translation || item.text || (typeof item === 'string' ? item : '') || '');
        const transText = rawStr.replace(/\r\n/g, ' ').replace(/\n+/g, ' ').trim();
        const origText = (item.original || item.source || '').trim();

        if (transText && item.id !== undefined && item.id !== null) {
            const rawIdStr = String(item.id).trim();
            mapById.set(rawIdStr, transText);
            mapById.set(rawIdStr.toLowerCase(), transText);
        }

        if (transText && origText) {
            mapByOriginal.set(origText, transText);
            mapByOriginal.set(origText.replace(/\s+/g, ''), transText);
        }

        if (transText) {
            listByOrder.push(transText);
        }
    });

    const usedSuffixIds = new Set<string>();

    return blocks.map((b, idx) => {
        const idStr = String(b.id || '').trim();
        const idLower = idStr.toLowerCase();
        const origTrim = (b.original || '').trim();
        const origNoSpace = origTrim.replace(/\s+/g, '');

        let translated = '';

        if (mapById.has(idStr)) {
            translated = mapById.get(idStr)!;
        } else if (mapById.has(idLower)) {
            translated = mapById.get(idLower)!;
        } else {
            const bNum = idStr.match(/b(\d+)$/i) || idStr.match(/(\d+)$/);
            if (bNum) {
                const sKey1 = `b${bNum[1]}`;
                const sKey2 = bNum[1];
                if (mapById.has(sKey1) && !usedSuffixIds.has(sKey1)) {
                    translated = mapById.get(sKey1)!;
                    usedSuffixIds.add(sKey1);
                } else if (mapById.has(sKey2) && !usedSuffixIds.has(sKey2)) {
                    translated = mapById.get(sKey2)!;
                    usedSuffixIds.add(sKey2);
                }
            }
        }

        if (!translated && origTrim && mapByOriginal.has(origTrim)) {
            translated = mapByOriginal.get(origTrim)!;
        } else if (!translated && origNoSpace && mapByOriginal.has(origNoSpace)) {
            translated = mapByOriginal.get(origNoSpace)!;
        }

        if (!translated && idx < listByOrder.length && listByOrder[idx]) {
            translated = listByOrder[idx];
        }

        return {
            ...b,
            translated: translated || b.translated || ''
        };
    });
}
