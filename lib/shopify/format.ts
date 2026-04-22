// Convert a plain-text description (with \n\n paragraph breaks and optional
// HTML entities like &nbsp;) into Shopify body_html where paragraphs are
// wrapped in <p> tags and single newlines become <br>.
//
// Behaviour:
//   - If input already looks like HTML (contains <p>, </p>, <br, <div, <ul, <li)
//     it's returned untouched — assumes the caller already formatted it.
//   - Otherwise, &nbsp; / &amp; / &lt; / &gt; / &quot; / &apos; / &#NNN;
//     sequences are preserved, but bare < and > are escaped so things like
//     accidental "<script>" become safe &lt;script&gt;.
//   - \r\n is normalised to \n. Two-or-more newlines start a new paragraph.
//   - Leading/trailing whitespace on each paragraph is trimmed.
//   - Empty input → empty string.
//
// See docs/plans/now-vs-strategic.md §5 Bug 3.

// Any of these markers = treat input as already-HTML (trusted staff composed it)
// and pass through untouched. Otherwise escape < and > for safety.
const HTML_MARKERS = /<\/?(p|br|div|ul|ol|li|h[1-6]|strong|em|span)\b/i

function escapeAngleBrackets(s: string): string {
  // Preserves HTML entities (&nbsp; &amp; &#39; etc.) because we only touch < and >.
  return s.replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function plainTextToHtml(input: string | null | undefined): string {
  if (!input) return ''
  const text = input.replace(/\r\n/g, '\n').trim()
  if (!text) return ''

  if (HTML_MARKERS.test(text)) {
    return text
  }

  const escaped = escapeAngleBrackets(text)
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p.length > 0)
    .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)

  return paragraphs.join('')
}
