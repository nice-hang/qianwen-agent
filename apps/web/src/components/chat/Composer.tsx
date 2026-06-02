import { useState, type FormEvent, type KeyboardEvent } from "react";
import type { ChatAttachment } from "@qianwen-agent/shared";
import { FileAttachmentChip } from "./MessageBubble";

export function Composer(props: {
  isSending: boolean;
  mode: "fast" | "deep";
  selectedAttachments: ChatAttachment[];
  onFileSelected: (file: File) => void;
  onImageSelected: (file: File) => void;
  onModeChange: (mode: "fast" | "deep") => void;
  onRemoveAttachment: (attachmentId: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>, draft: string) => void;
  resolveAttachmentUrl: (url: string) => string;
}) {
  const [draft, setDraft] = useState("");
  const [isUploadMenuOpen, setUploadMenuOpen] = useState(false);
  const canSubmit =
    !props.isSending &&
    (draft.trim().length > 0 || props.selectedAttachments.length > 0);

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        if (!canSubmit) {
          event.preventDefault();
          return;
        }

        props.onSubmit(event, draft);
        setDraft("");
      }}
    >
      {props.selectedAttachments.length > 0 ? (
        <AttachmentPreviewStrip
          attachments={props.selectedAttachments}
          onRemove={props.onRemoveAttachment}
          resolveAttachmentUrl={props.resolveAttachmentUrl}
        />
      ) : null}
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleComposerKeyDown}
        placeholder="向千问提问"
        rows={3}
      />
      <div className="composer-footer">
        <div className="composer-controls">
          <div className="upload-menu-wrap">
            {isUploadMenuOpen ? (
              <div className="upload-menu" role="menu">
                <label className="upload-menu-item" role="menuitem">
                  <input
                    accept=".txt,.md,.csv,.pdf,.docx,text/plain,text/markdown,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    type="file"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      event.currentTarget.value = "";
                      setUploadMenuOpen(false);
                      if (file) props.onFileSelected(file);
                    }}
                  />
                  <DocumentUploadIcon />
                  <span>上传文档</span>
                </label>
                <label className="upload-menu-item" role="menuitem">
                  <input
                    accept="image/*"
                    type="file"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      event.currentTarget.value = "";
                      setUploadMenuOpen(false);
                      if (file) props.onImageSelected(file);
                    }}
                  />
                  <ImageUploadIcon />
                  <span>上传图片</span>
                </label>
              </div>
            ) : null}
            <button
              className={isUploadMenuOpen ? "upload-trigger active" : "upload-trigger"}
              type="button"
              aria-label="打开上传菜单"
              aria-expanded={isUploadMenuOpen}
              onClick={() => setUploadMenuOpen((value) => !value)}
            >
              {isUploadMenuOpen ? <CloseIcon /> : <PlusIcon />}
            </button>
          </div>
          <button
            className={props.mode === "deep" ? "thinking-mode active" : "thinking-mode"}
            type="button"
            aria-pressed={props.mode === "deep"}
            onClick={() =>
              props.onModeChange(props.mode === "deep" ? "fast" : "deep")
            }
          >
            <ThinkingModeIcon />
            <span>思考</span>
          </button>
        </div>
        <button
          className="send-button"
          type="submit"
          disabled={!canSubmit}
          aria-label="Send message"
        >
          ↑
        </button>
      </div>
    </form>
  );
}

function AttachmentPreviewStrip(props: {
  attachments: ChatAttachment[];
  onRemove: (attachmentId: string) => void;
  resolveAttachmentUrl: (url: string) => string;
}) {
  return (
    <div className="attachment-preview-strip">
      {props.attachments.map((attachment) => (
        <div className="attachment-preview" key={attachment.id}>
          {attachment.mimeType.startsWith("image/") ? (
            <img
              alt={attachment.fileName}
              src={props.resolveAttachmentUrl(attachment.url)}
            />
          ) : (
            <FileAttachmentChip attachment={attachment} />
          )}
          <button
            type="button"
            onClick={() => props.onRemove(attachment.id)}
            aria-label={`移除 ${attachment.fileName}`}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
    return;
  }

  event.preventDefault();
  event.currentTarget.form?.requestSubmit();
}

function PlusIcon() {
  return (
    <svg className="upload-trigger-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M10 4.5v11M4.5 10h11"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="upload-trigger-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="m5.75 5.75 8.5 8.5m0-8.5-8.5 8.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function DocumentUploadIcon() {
  return (
    <svg
      className="upload-menu-icon"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5.75 2.75h5.1l3.4 3.4v3.35"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
      <path
        d="M10.75 2.75v3.4h3.4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
      <path
        d="M8.4 16.75H5.75a1.6 1.6 0 0 1-1.6-1.6V4.35a1.6 1.6 0 0 1 1.6-1.6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
      <path
        d="M14.75 17.25v-6.5m0 0 2.35 2.35m-2.35-2.35-2.35 2.35"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function ImageUploadIcon() {
  return (
    <svg
      className="upload-menu-icon"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3.25 13.65V5.3A2.05 2.05 0 0 1 5.3 3.25h7.2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
      <path
        d="M3.45 13.15 7.1 9.55a1.25 1.25 0 0 1 1.75 0l1.35 1.35.7-.7a1.25 1.25 0 0 1 1.75 0l2 2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
      <path
        d="M8.6 16.75H5.3a2.05 2.05 0 0 1-2.05-2.05"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
      <path
        d="M14.75 8.65v-5.9m0 0 2.1 2.1m-2.1-2.1-2.1 2.1"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function ThinkingModeIcon() {
  return (
    <svg
      className="thinking-mode-icon"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M9.7 2.9 8.15 7.2 3.85 8.75l4.3 1.55 1.55 4.3 1.55-4.3 4.3-1.55-4.3-1.55L9.7 2.9Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.35"
      />
      <path
        d="m15.45 12.2-.55 1.5-1.5.55 1.5.55.55 1.5.55-1.5 1.5-.55-1.5-.55-.55-1.5Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
    </svg>
  );
}
