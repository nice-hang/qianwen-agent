import React from "react";
import { createRoot } from "react-dom/client";
import type { AgentEvent, ChatMessage } from "@qianwen-agent/shared";
import "./styles.css";

const sampleMessage: ChatMessage = {
  id: "stage0-message",
  conversationId: "stage0-conversation",
  role: "assistant",
  status: "completed",
  content: "Shared protocol is wired into the web app.",
  createdAt: new Date().toISOString()
};

const sampleEvent = {
  type: "answer_delta",
  text: "Web can import AgentEvent from @qianwen-agent/shared."
} satisfies AgentEvent;

function App() {
  return (
    <main className="shell">
      <section className="chat">
        <header className="topbar">
          <div>
            <p className="eyebrow">Stage 0</p>
            <h1>Qianwen Agent Chatbox</h1>
          </div>
          <span className="status">Shared ready</span>
        </header>

        <div className="message">
          <p className="role">{sampleMessage.role}</p>
          <p>{sampleMessage.content}</p>
        </div>

        <div className="event">
          <span>{sampleEvent.type}</span>
          <p>{sampleEvent.text}</p>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
