// Converts the subset of Markdown chat models emit into Telegram HTML. Everything is escaped first and each
// pattern only matches text without tags in it, so the output is always well-formed HTML.

const FENCE_PATTERN = /^\s*```/;
const HEADING_PATTERN = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/;
const BULLET_PATTERN = /^(\s*)[-*+]\s+/;
// Escaping can grow text up to 5x (& -> &amp;), so slices this long always fit in one 4096-char message.
const LONG_LINE_SLICE = 800;

function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function convertInline(text: string): string {
    // Code spans are split out first so nothing inside them is formatted.
    return text
        .split(/(`[^`\n]+`)/)
        .map((part) => {
            if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) {
                return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
            }
            // Links stay visible as text plus URL: a hidden href would let content from an email disguise a link.
            return escapeHtml(part)
                .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)')
                .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, '<b>$1</b>')
                .replace(/__(?=\S)([^<>]+?)(?<=\S)__/g, '<b>$1</b>')
                .replace(/~~(?=\S)([^<>]+?)(?<=\S)~~/g, '<s>$1</s>')
                .replace(/(?<![\w*])\*(?=[^\s*])([^<>*]+?)(?<=[^\s*])\*(?![\w*])/g, '<i>$1</i>');
        })
        .join('');
}

function convertLine(line: string): string {
    const heading = HEADING_PATTERN.exec(line);
    if (heading?.[1]) {
        return `<b>${convertInline(heading[1])}</b>`;
    }
    const bullet = BULLET_PATTERN.exec(line);
    if (bullet) {
        return `${bullet[1]}• ${convertInline(line.slice(bullet[0].length))}`;
    }
    return convertInline(line);
}

function sliceLine(line: string): string[] {
    const slices: string[] = [];
    for (let start = 0; start < line.length; start += LONG_LINE_SLICE) {
        slices.push(line.slice(start, start + LONG_LINE_SLICE));
    }
    return slices.length > 0 ? slices : [''];
}

function preUnits(codeLines: string[], maxLength: number): string[] {
    const units: string[] = [];
    let current: string[] = [];
    const wrap = (lines: string[]) => `<pre>${lines.map(escapeHtml).join('\n')}</pre>`;
    for (const line of codeLines.flatMap(sliceLine)) {
        if (current.length > 0 && wrap([...current, line]).length > maxLength) {
            units.push(wrap(current));
            current = [];
        }
        current.push(line);
    }
    if (current.length > 0) {
        units.push(wrap(current));
    }
    return units;
}

function lineUnits(line: string, maxLength: number): string[] {
    const converted = convertLine(line);
    if (converted.length <= maxLength) {
        return [converted];
    }
    return sliceLine(line).map(convertInline);
}

/** Converts Markdown to Telegram HTML, split into messages of at most `maxLength` characters. */
export function markdownToTelegramHtml(markdown: string, maxLength: number): string[] {
    const units: string[] = [];
    let codeLines: string[] | null = null;

    for (const line of markdown.split('\n')) {
        if (FENCE_PATTERN.test(line)) {
            if (codeLines) {
                units.push(...preUnits(codeLines, maxLength));
                codeLines = null;
            } else {
                codeLines = [];
            }
            continue;
        }
        if (codeLines) {
            codeLines.push(line);
        } else {
            units.push(...lineUnits(line, maxLength));
        }
    }
    if (codeLines) {
        units.push(...preUnits(codeLines, maxLength));
    }

    const chunks: string[] = [];
    let current = '';
    for (const unit of units) {
        if (current && current.length + 1 + unit.length > maxLength) {
            chunks.push(current);
            current = unit;
        } else {
            current = current ? `${current}\n${unit}` : unit;
        }
    }
    if (current.trim()) {
        chunks.push(current);
    }
    return chunks.filter((chunk) => chunk.trim().length > 0);
}
