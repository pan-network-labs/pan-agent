'use client';

import { useState } from 'react';
import Image from 'next/image';

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('请输入提示词');
      return;
    }

    setLoading(true);
    setError(null);
    setImageUrl(null);

    try {
      const response = await fetch('/api/generate-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      });

      const data = await response.json();

      // 统一响应格式：{ code: 200, msg: "success", data: { data: "图片URL" } }
      if (data.code === 200 && data.data?.data) {
        setImageUrl(data.data.data);
      } else {
        throw new Error(data.msg || '生成图片失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成图片时发生错误');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleGenerate();
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-4xl flex-col items-center justify-start py-8 px-4 sm:px-8 md:px-16">
        <div className="w-full space-y-6">
          {/* 标题 */}
          <div className="text-center">
            <h1 className="text-3xl font-bold text-black dark:text-zinc-50 mb-2">
              智谱AI 图片生成测试
            </h1>
            <p className="text-zinc-600 dark:text-zinc-400">
              CogView-3-Flash 模型
            </p>
          </div>

          {/* 输入区域 */}
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg p-6 space-y-4">
            <div>
              <label
                htmlFor="prompt"
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2"
              >
                提示词
              </label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="输入您想要生成的图片描述，例如：一只可爱的小猫咪坐在窗台上"
                className="w-full px-4 py-3 border border-zinc-300 dark:border-zinc-700 rounded-lg 
                         focus:outline-none focus:ring-2 focus:ring-blue-500 
                         bg-white dark:bg-zinc-800 
                         text-zinc-900 dark:text-zinc-100
                         resize-none"
                rows={4}
                disabled={loading}
              />
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                提示：按 Cmd/Ctrl + Enter 快速生成
              </p>
            </div>

            <button
              onClick={handleGenerate}
              disabled={loading || !prompt.trim()}
              className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 
                       disabled:bg-zinc-400 disabled:cursor-not-allowed
                       text-white font-medium rounded-lg 
                       transition-colors duration-200
                       flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin h-5 w-5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  <span>生成中...</span>
                </>
              ) : (
                <span>生成图片</span>
              )}
            </button>

            {/* 错误提示 */}
            {error && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
              </div>
            )}
          </div>

          {/* 图片展示区域 */}
          {imageUrl && (
            <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg p-6">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
                生成的图片
              </h2>
              <div className="relative w-full aspect-square bg-zinc-100 dark:bg-zinc-800 rounded-lg overflow-hidden">
                <Image
                  src={imageUrl}
                  alt={prompt}
                  fill
                  className="object-contain"
                  unoptimized
                />
              </div>
              <div className="mt-4 flex gap-2">
                <a
                  href={imageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
                >
                  查看原图
                </a>
                <button
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = imageUrl;
                    link.download = `generated-image-${Date.now()}.png`;
                    link.click();
                  }}
                  className="px-4 py-2 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-900 dark:text-zinc-100 rounded-lg transition-colors text-sm"
                >
                  下载图片
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
