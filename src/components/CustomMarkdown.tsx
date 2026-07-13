import React from "react";
import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw";

interface CustomMarkdownProps {
  content: string;
  theme?: "light" | "dark";
  onMediaClick?: (url: string, type: 'image' | 'video') => void;
}

export default function CustomMarkdown({ content, theme = "light", onMediaClick }: CustomMarkdownProps) {
  if (!content) return null;

  const isDark = theme === "dark";

  return (
    <div className={`markdown-body space-y-4 text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>
      <Markdown
        rehypePlugins={[rehypeRaw]}
        components={{
          h1: ({node, ...props}) => <h1 className={`text-2xl font-bold mt-8 mb-4 ${isDark ? "text-white" : "text-slate-950"}`} {...props} />,
          h2: ({node, ...props}) => <h2 className={`text-xl font-bold mt-6 mb-3 ${isDark ? "text-white" : "text-slate-950"}`} {...props} />,
          h3: ({node, ...props}) => <h3 className={`text-lg font-bold mt-5 mb-2.5 ${isDark ? "text-white" : "text-slate-900"}`} {...props} />,
          h4: ({node, ...props}) => <h4 className={`text-base font-semibold mt-4 mb-2 ${isDark ? "text-slate-100" : "text-slate-800"}`} {...props} />,
          p: ({node, ...props}) => <p className={`my-3 ${isDark ? "text-slate-300" : "text-slate-600"}`} {...props} />,
          ul: ({node, ...props}) => <ul className="list-disc pl-5 space-y-1 my-3" {...props} />,
          ol: ({node, ...props}) => <ol className="list-decimal pl-5 space-y-1 my-3" {...props} />,
          li: ({node, ...props}) => <li className={isDark ? "text-slate-300" : "text-slate-600"} {...props} />,
          a: ({node, ...props}) => <a className="text-indigo-500 hover:text-indigo-600 underline" target="_blank" rel="noopener noreferrer" {...props} />,
          strong: ({node, ...props}) => <strong className={`font-semibold ${isDark ? "text-white" : "text-slate-900"}`} {...props} />,
          code: ({node, inline, className, children, ...props}: any) => {
            const match = /language-(\w+)/.exec(className || '');
            const lang = match ? match[1] : "";
            
            if (!inline) {
              return (
                <div className={`relative my-4 rounded-xl overflow-hidden border shadow-lg ${isDark ? "bg-[#111218] border-white/10" : "bg-slate-900 border-slate-800"}`}>
                  {lang && (
                    <div className="flex items-center justify-between px-4 py-1.5 bg-black/20 text-slate-400 text-xs font-mono border-b border-white/10">
                      <span>{lang}</span>
                    </div>
                  )}
                  <pre className="p-4 overflow-x-auto text-xs text-indigo-200 font-mono leading-relaxed select-all">
                    <code className={className} {...props}>
                      {children}
                    </code>
                  </pre>
                </div>
              );
            }
            return (
              <code className={`px-1.5 py-0.5 rounded font-mono text-xs ${isDark ? "bg-white/10 border border-white/20 text-indigo-300" : "bg-slate-100 border border-slate-200/60 text-indigo-600"}`} {...props}>
                {children}
              </code>
            );
          },
          img: ({node, ...props}) => (
            <img 
              className={`max-w-full h-auto rounded-lg my-2 inline-block ${onMediaClick ? 'cursor-pointer hover:opacity-90 transition' : ''}`} 
              referrerPolicy="no-referrer" 
              onClick={() => {
                if (onMediaClick && props.src) onMediaClick(props.src, 'image');
              }}
              {...props} 
            />
          ),
          video: ({node, ...props}: any) => {
            const src = props.src || "";
            const lowerSrc = src.toLowerCase();
            
            // Helper to check if direct video file
            const isDirectVideo = lowerSrc.endsWith(".mp4") || 
                                 lowerSrc.endsWith(".webm") || 
                                 lowerSrc.endsWith(".ogg") || 
                                 lowerSrc.endsWith(".mov") ||
                                 (lowerSrc.includes("githubusercontent.com") && lowerSrc.includes(".mp4"));
            
            // Helper to get YouTube/Vimeo embed URL
            const getEmbedUrl = (url: string): string | null => {
              const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
              const ytMatch = url.match(ytRegex);
              if (ytMatch && ytMatch[1]) {
                return `https://www.youtube.com/embed/${ytMatch[1]}`;
              }
              
              const vimeoRegex = /(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/;
              const vimeoMatch = url.match(vimeoRegex);
              if (vimeoMatch && vimeoMatch[1]) {
                return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
              }
              
              return null;
            };

            const embedUrl = getEmbedUrl(src);

            if (isDirectVideo) {
              return (
                <div 
                  className={`my-4 overflow-hidden rounded-xl border relative group ${onMediaClick ? 'cursor-pointer' : ''}`}
                  onClick={() => {
                    if (onMediaClick) onMediaClick(src, 'video');
                  }}
                >
                  <video 
                    src={src} 
                    className="w-full max-h-[480px] object-cover bg-black" 
                    controls 
                    playsInline 
                    preload="metadata"
                  />
                  {onMediaClick && (
                    <div className="absolute top-2 right-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                      🔍 クリックして拡大
                    </div>
                  )}
                </div>
              );
            }

            if (embedUrl) {
              return (
                <div className="my-4 aspect-video w-full overflow-hidden rounded-xl border border-slate-200/60 dark:border-white/10 shadow-lg bg-black">
                  <iframe 
                    src={embedUrl}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                </div>
              );
            }

            return (
              <div className={`my-4 p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${isDark ? "bg-[#111218]/60 border-white/10" : "bg-slate-50 border-slate-200"}`} id="fallback-video-card">
                <div className="flex items-center space-x-3 min-w-0">
                  <span className="text-xl shrink-0">🎥</span>
                  <div className="min-w-0">
                    <p className={`font-semibold text-sm ${isDark ? "text-slate-200" : "text-slate-800"}`}>デモ動画 / Repository Demo Video</p>
                    <p className={`text-xs font-mono truncate max-w-[240px] sm:max-w-md ${isDark ? "text-slate-400" : "text-slate-500"}`}>{src}</p>
                  </div>
                </div>
                <a 
                  href={src} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className={`shrink-0 px-4 py-2 rounded-lg text-xs font-semibold shadow transition-all duration-200 flex items-center justify-center space-x-1.5 ${isDark ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/30" : "bg-indigo-600 hover:bg-indigo-700 text-white"}`}
                  id="video-link-card-button"
                >
                  <span>デモ動画を見る (外部リンク) ↗</span>
                </a>
              </div>
            );
          },
          blockquote: ({node, ...props}) => <blockquote className={`border-l-4 pl-4 py-1 my-4 italic ${isDark ? "border-slate-700 text-slate-400" : "border-slate-300 text-slate-500"}`} {...props} />,
          table: ({node, ...props}) => <div className="overflow-x-auto my-4"><table className={`w-full text-left border-collapse text-sm ${isDark ? "text-slate-300" : "text-slate-700"}`} {...props} /></div>,
          th: ({node, ...props}) => <th className={`p-2 border-b font-semibold ${isDark ? "border-slate-700 text-white" : "border-slate-200 text-slate-900"}`} {...props} />,
          td: ({node, ...props}) => <td className={`p-2 border-b ${isDark ? "border-slate-800 text-slate-300" : "border-slate-100 text-slate-600"}`} {...props} />
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
