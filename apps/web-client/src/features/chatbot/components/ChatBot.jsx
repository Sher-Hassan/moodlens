import { useEffect, useRef } from 'react';
import { useChatbot } from '../hooks/useChatbot';
import { useUser } from '../../../context/UserContext';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import ChatWelcome from './ChatWelcome';
import '../styles/chatbot.css';

export default function ChatBot() {
    const { user } = useUser();
    const {
        isOpen, toggleOpen, setIsOpen,
        messages, isThinking, thinkingHint, welcome,
        dismissWelcome, sendMessage, resetConversation,
    } = useChatbot();

    const messagesEndRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return;
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [messages, isThinking, isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const handler = (e) => { if (e.key === 'Escape') setIsOpen(false); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [isOpen, setIsOpen]);

    if (!user) return null;

    const handleSuggestion = (text) => {
        dismissWelcome();
        setIsOpen(true);
        setTimeout(() => sendMessage(text), 50);
    };

    return (
        <>
            {!isOpen && welcome && (
                <ChatWelcome
                    welcome={welcome}
                    onSuggestionClick={handleSuggestion}
                    onDismiss={dismissWelcome}
                    onExpand={() => setIsOpen(true)}
                />
            )}

            <button
                type="button"
                className={`cb-fab ${isOpen ? 'cb-fab--open' : ''}`}
                onClick={toggleOpen}
                aria-label={isOpen ? 'Close AI Coach' : 'Open AI Coach'}
                aria-expanded={isOpen}
            >
                {isOpen ? (
                    <span className="cb-fab__icon" aria-hidden="true">×</span>
                ) : (
                    <>
                        <span className="cb-fab__icon" aria-hidden="true">◉</span>
                        {!welcome && messages.length === 0 && (
                            <span className="cb-fab__pulse" aria-hidden="true" />
                        )}
                    </>
                )}
            </button>

            {isOpen && (
                <div className="cb-panel" role="dialog" aria-label="AI Coach chat">
                    <header className="cb-panel__head">
                        <div className="cb-panel__head-info">
                            <span className="cb-panel__avatar" aria-hidden="true">◉</span>
                            <div>
                                <p className="cb-panel__title">AI Coach</p>
                                <p className="cb-panel__subtitle">
                                    <span className="cb-panel__dot" /> Online
                                </p>
                            </div>
                        </div>
                        <div className="cb-panel__head-actions">
                            {messages.length > 0 && (
                                <button
                                    type="button"
                                    className="cb-panel__head-btn"
                                    onClick={resetConversation}
                                    title="Start new conversation"
                                    aria-label="Start new conversation"
                                >
                                    <span aria-hidden="true">↻</span>
                                </button>
                            )}
                            <button
                                type="button"
                                className="cb-panel__head-btn"
                                onClick={() => setIsOpen(false)}
                                title="Close"
                                aria-label="Close panel"
                            >
                                <span aria-hidden="true">×</span>
                            </button>
                        </div>
                    </header>

                    <div className="cb-panel__body">
                        {messages.length === 0 && !isThinking && (
                            <div className="cb-empty">
                                <span className="cb-empty__icon" aria-hidden="true">◉</span>
                                <p className="cb-empty__title">Hi, I'm your AI Coach</p>
                                <p className="cb-empty__text">
                                    Ask me about your data, how to use the app, or general wellness questions.
                                </p>
                                {welcome?.suggestions && (
                                    <div className="cb-empty__suggestions">
                                        {welcome.suggestions.map((s, i) => (
                                            <button
                                                key={i}
                                                type="button"
                                                className="cb-empty__chip"
                                                onClick={() => sendMessage(s.message)}
                                            >
                                                {s.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {messages.map((msg) => (
                            <ChatMessage
                                key={msg.id}
                                message={msg}
                                onClose={() => setIsOpen(false)}
                            />
                        ))}

                        {isThinking && (
                            <div className="cb-msg cb-msg--coach cb-msg--thinking">
                                <div className="cb-msg__avatar" aria-hidden="true">
                                    <span className="cb-msg__avatar-mark">◉</span>
                                </div>
                                <div className="cb-msg__bubble cb-msg__bubble--thinking">
                                    <span className="cb-dot" />
                                    <span className="cb-dot" />
                                    <span className="cb-dot" />
                                    {thinkingHint === 'cold-start' && (
                                        <span className="cb-thinking-hint">
                                            Waking up the server… first request takes a moment.
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    <footer className="cb-panel__foot">
                        <ChatInput onSend={sendMessage} disabled={isThinking} />
                        <p className="cb-panel__disclaimer">
                            AI Coach is informational only — not medical advice.
                        </p>
                    </footer>
                </div>
            )}
        </>
    );
}
