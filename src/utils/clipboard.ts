/**
 * Copy text to clipboard with fallback for when Clipboard API is blocked
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // Try modern Clipboard API first
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('Clipboard API failed, using fallback method:', err);
      // Fall through to fallback method
    }
  }

  // Fallback method using deprecated document.execCommand
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    
    // Make it invisible and take it out of document flow
    textArea.style.position = 'fixed';
    textArea.style.top = '-9999px';
    textArea.style.left = '-9999px';
    textArea.style.opacity = '0';
    textArea.setAttribute('readonly', '');
    
    document.body.appendChild(textArea);
    
    // Select the text
    if (navigator.userAgent.match(/ipad|iphone/i)) {
      // iOS requires a different approach
      const range = document.createRange();
      range.selectNodeContents(textArea);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
      textArea.setSelectionRange(0, 999999);
    } else {
      textArea.select();
    }
    
    // Copy the text
    const successful = document.execCommand('copy');
    
    // Clean up
    document.body.removeChild(textArea);
    
    return successful;
  } catch (err) {
    console.error('Fallback clipboard method also failed:', err);
    return false;
  }
}
