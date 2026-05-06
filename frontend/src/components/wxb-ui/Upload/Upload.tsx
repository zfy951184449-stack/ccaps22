import React, { useCallback } from 'react';
import './Upload.css';

export interface WxbUploadFile { name: string; size?: number; status?: 'done' | 'uploading' | 'error'; uid: string; }
export interface WxbUploadProps { accept?: string; multiple?: boolean; onFilesSelected?: (files: File[]) => void; fileList?: WxbUploadFile[]; children?: React.ReactNode; className?: string; }

export const WxbUpload: React.FC<WxbUploadProps> = ({
  accept, multiple = false, onFilesSelected, fileList = [], children, className = '',
}) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = React.useState(false);

  const handleFiles = useCallback((files: FileList | null) => {
    if (files) onFilesSelected?.(Array.from(files));
  }, [onFilesSelected]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  return (
    <div className={`wxb-upload ${className}`}>
      <div className={`wxb-upload-dragger ${dragOver ? 'is-dragover' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}>
        <input ref={inputRef} type="file" accept={accept} multiple={multiple} style={{ display: 'none' }}
          onChange={(e) => handleFiles(e.target.files)} />
        {children || (
          <>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--wx-fg-4,#8898A8)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <div className="wxb-upload-text">点击或拖拽文件到此区域</div>
            <div className="wxb-upload-hint">支持单个或批量上传</div>
          </>
        )}
      </div>
      {fileList.length > 0 && (
        <div className="wxb-upload-list">
          {fileList.map(f => (
            <div key={f.uid} className={`wxb-upload-file wxb-upload-${f.status || 'done'}`}>
              <span className="wxb-upload-name">{f.name}</span>
              {f.size && <span className="wxb-upload-size">{(f.size / 1024).toFixed(1)} KB</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
