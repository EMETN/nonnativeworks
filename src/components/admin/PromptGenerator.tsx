import { useState } from 'preact/hooks';
import { generatePrompt } from '../../lib/prompt-template';

function isValidUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export default function PromptGenerator() {
  const [url, setUrl] = useState('');
  const [prompt, setPrompt] = useState('');
  const [copied, setCopied] = useState(false);
  const [urlError, setUrlError] = useState('');

  function handleGenerate() {
    const trimmed = url.trim();
    if (!isValidUrl(trimmed)) {
      setUrlError('Please enter a valid URL (e.g. https://company.com/careers)');
      return;
    }
    setUrlError('');
    setPrompt(generatePrompt(trimmed));
    setCopied(false);
  }

  function handleUrlInput(value: string) {
    setUrl(value);
    if (urlError) setUrlError('');
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div class="space-y-4">
      <div>
        <div class="flex flex-col sm:flex-row gap-3">
          <input
            type="url"
            placeholder="https://company.com/careers"
            value={url}
            onInput={(e) => handleUrlInput((e.target as HTMLInputElement).value)}
            class={`flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a] ${urlError ? 'border-red-400' : 'border-gray-300'}`}
          />
          <button
            onClick={handleGenerate}
            disabled={!url.trim()}
            class="bg-[#166534] text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-[#14532d] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            Generate prompt
          </button>
        </div>
        {urlError && (
          <p class="text-xs text-red-500 mt-1">{urlError}</p>
        )}
      </div>

      {prompt && (
        <div>
          <textarea
            readOnly
            value={prompt}
            rows={16}
            class="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono bg-gray-50 resize-none focus:outline-none"
          />
          <div class="flex justify-end mt-2">
            <button
              onClick={handleCopy}
              class="bg-[#166534] text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-[#14532d] transition-colors"
            >
              {copied ? '✓ Copied' : 'Copy prompt'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
