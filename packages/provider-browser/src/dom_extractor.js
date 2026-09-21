/**
 * In-browser DOM extraction and element indexing.
 */
export class DomExtractor {
    /**
     * Generates a compact formatted table of interactive elements for TypeSafe System One.
     */
    static buildSummaryTable(elements) {
        if (elements.length === 0) {
            return '(No visible interactive elements detected)';
        }
        return elements
            .map((el) => {
            const parts = [`[${el.index}]`];
            const roleOrTag = el.role || el.type || el.tagName.toLowerCase();
            parts.push(roleOrTag.padEnd(10));
            const safeLabel = (el.label || 'unlabeled').replace(/\s+/g, ' ').trim();
            parts.push(`"${safeLabel}"`);
            const flags = [];
            if (el.value)
                flags.push(`val: "${el.value.slice(0, 25)}"`);
            if (el.checked)
                flags.push('checked');
            if (el.disabled)
                flags.push('disabled');
            if (el.isIrreversible)
                flags.push('⚠️ IRREVERSIBLE');
            if (el.options && el.options.length > 0) {
                flags.push(`options: [${el.options.slice(0, 3).join(', ')}]`);
            }
            if (flags.length > 0) {
                parts.push(`· ${flags.join(', ')}`);
            }
            return parts.join(' ');
        })
            .join('\n');
    }
    /**
     * Browser-side evaluation script that identifies interactive DOM nodes,
     * stamps them with unique data attributes, and returns structured data.
     */
    static getExtractionScript(obsId) {
        return `
      (() => {
        const elements = [];
        let index = 1;

        const candidates = document.querySelectorAll(
          'button, a[href], input, textarea, select, [role="button"], [role="link"], [role="checkbox"], [role="menuitem"], [role="tab"], [tabindex="0"]'
        );

        for (const el of candidates) {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            continue;
          }

          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) {
            continue;
          }

          // Stamp element with observation index
          el.setAttribute('data-fastpath-id', '${obsId}:' + index);

          let label = el.getAttribute('aria-label') ||
                      el.getAttribute('title') ||
                      el.getAttribute('placeholder') ||
                      (el.innerText ? el.innerText.trim() : '') ||
                      el.getAttribute('value') ||
                      '';

          label = label.slice(0, 80).trim();

          const item = {
            ref: '${obsId}:' + index,
            index: index,
            tagName: el.tagName,
            role: el.getAttribute('role') || undefined,
            type: el.getAttribute('type') || undefined,
            label: label,
            value: el.value !== undefined ? String(el.value) : undefined,
            placeholder: el.getAttribute('placeholder') || undefined,
            disabled: Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true'),
            checked: Boolean(el.checked || el.getAttribute('aria-checked') === 'true'),
            options: el.tagName === 'SELECT' ? Array.from(el.options).map(o => o.text.trim()) : undefined
          };

          elements.push(item);
          index++;
        }

        return elements;
      })();
    `;
    }
}
//# sourceMappingURL=dom_extractor.js.map