const chatContainer = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-message');
const imageUpload = document.getElementById('image-upload');
const previewPanel = document.getElementById('preview-panel');
const imagePreview = document.getElementById('image-preview');
const cancelUpload = document.getElementById('cancel-upload');
const statusBadge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');
const statusDot = document.getElementById('status-dot');
const statusPing = document.getElementById('status-ping');
const newChatBtn = document.getElementById('new-chat-btn');

let currentConversationId = null;
let currentPhotoData = null; // [filename, url]
let isThinking = false;
let isUploading = false;

// Auto-expand textarea
userInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
});

// Handle Enter key
userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

sendBtn.addEventListener('click', sendMessage);

// New Chat Functionality
newChatBtn?.addEventListener('click', () => {
    chatContainer.innerHTML = `
        <div class="flex flex-col items-center justify-center py-20 animate-fade-in">
            <div class="w-20 h-20 rounded-3xl bg-white shadow-2xl flex items-center justify-center text-blue-600 text-3xl mb-6 transform hover:rotate-6 transition-transform">
                <i class="fa-solid fa-bolt-lightning"></i>
            </div>
            <h2 class="text-2xl font-black font-['Outfit'] text-slate-800 mb-2 text-center">New Conversation Started</h2>
            <p class="text-slate-400 text-center max-w-sm text-sm leading-relaxed">System cleared and ready for fresh prompts.</p>
        </div>
    `;
    currentConversationId = null;
    statusText.innerText = "New Session Ready";
});

// Status Logic
async function updateStatus() {
    let isServerDown = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    try {
        const ping = await fetch('/', { method: 'HEAD', signal: controller.signal });
        if (!ping.ok) isServerDown = true;
    } catch (e) {
        isServerDown = true;
    } finally {
        clearTimeout(timeoutId);
    }

    const badgeMobile = document.getElementById('status-badge-mobile');
    
    if (navigator.onLine && !isServerDown) {
        const activeClasses = "flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-white/80 backdrop-blur-xl border border-white shadow-lg shadow-slate-200/50 text-emerald-600 transition-all duration-700";
        if (statusBadge) statusBadge.className = activeClasses;
        if (statusText) statusText.innerText = "System Ready";
        if (statusPing) statusPing.className = "animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75";
        if (badgeMobile) badgeMobile.className = "flex items-center gap-1.5 bg-emerald-100/50 text-emerald-600 px-3 py-1 rounded-full text-[10px] font-bold";
    } else {
        const errorClasses = "flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 transition-all duration-700 shadow-xl shadow-rose-200/20";
        if (statusBadge) statusBadge.className = errorClasses;
        if (statusText) statusText.innerText = isServerDown ? "Offline" : "No Internet";
        if (statusPing) statusPing.className = "hidden";
        if (badgeMobile) badgeMobile.className = "flex items-center gap-1.5 bg-rose-100 text-rose-600 px-3 py-1 rounded-full text-[10px] font-bold";
    }
}

setInterval(updateStatus, 5000);
updateStatus();

// Photo Upload Logic
imageUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            imagePreview.src = event.target.result;
            previewPanel.classList.remove('hidden');
        };
        reader.readAsDataURL(file);

        const formData = new FormData();
        formData.append('image', file);
        
        try {
            isUploading = true;
            statusText.innerText = "Uploading Image...";
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            const data = await res.json();
            if (data.url) {
                currentPhotoData = [data.name, data.url];
                statusText.innerText = "Image Ready";
            }
        } catch (error) {
            console.error('Upload failed:', error);
            previewPanel.classList.add('hidden');
            statusText.innerText = "Upload Failed";
        } finally {
            isUploading = false;
            updateStatus();
        }
    }
});

cancelUpload.addEventListener('click', () => {
    previewPanel.classList.add('hidden');
    currentPhotoData = null;
    imageUpload.value = '';
});

async function sendMessage() {
    const text = userInput.value.trim();
    if ((!text && !currentPhotoData) || isThinking || isUploading) return;

    addUserMessage(text, currentPhotoData ? imagePreview.src : null);
    
    const photoToSend = currentPhotoData;
    userInput.value = '';
    userInput.style.height = 'auto';
    previewPanel.classList.add('hidden');
    currentPhotoData = null;

    isThinking = true;
    const typingId = showTypingLoader();

    try {
        const response = await fetch('/api/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: text,
                conversationId: currentConversationId,
                photo: photoToSend
            })
        });

        const data = await response.json();
        removeTypingLoader(typingId);
        isThinking = false;

        if (data.error) {
            addSystemMessage(`System Error: ${data.error}`);
            return;
        }

        currentConversationId = data.conversation_id;
        const msgElement = addGeminiMessage(data.text);
        
        if (data.image_urls?.length) data.image_urls.forEach(url => renderMessageImage(msgElement, url));
        if (data.generated_image_urls?.length) data.generated_image_urls.forEach(url => renderMessageImage(msgElement, url));

        renderMessageTools(msgElement, data.text);
    } catch (error) {
        removeTypingLoader(typingId);
        isThinking = false;
        addSystemMessage("Connection error occurred.");
    }
}

// UI Rendering Functions
function addUserMessage(text, imgData) {
    const div = document.createElement('div');
    div.className = "flex flex-col items-end message user-message animate-slide-in ml-auto";
    
    div.innerHTML = `
        <div class="flex items-center gap-2 mb-2 px-1 text-slate-400">
            <span class="text-[10px] font-bold uppercase tracking-wider">You</span>
            <img src="https://ui-avatars.com/api/?name=U&background=2563eb&color=fff" class="w-5 h-5 rounded-full">
        </div>
        <div class="message-bubble px-6 py-4 rounded-[2rem] rounded-tr-none text-white leading-relaxed text-sm">
            ${imgData ? `<img src="${imgData}" class="mb-4 rounded-2xl border border-white/20 shadow-lg">` : ''}
            <div>${formatText(text)}</div>
        </div>
    `;
    
    chatContainer.appendChild(div);
    scrollToBottom();
}

function addGeminiMessage(text) {
    const div = document.createElement('div');
    div.className = "flex flex-col items-start message gemini-message animate-slide-in mr-auto";
    
    div.innerHTML = `
        <div class="flex items-center gap-2 mb-2 px-1 text-slate-400">
            <div class="w-5 h-5 rounded-md bg-blue-600 flex items-center justify-center text-[10px] text-white">
                <i class="fa-solid fa-sparkles"></i>
            </div>
            <span class="text-[10px] font-bold uppercase tracking-wider">Gemini Pro</span>
        </div>
        <div class="message-bubble bg-white px-6 py-4 rounded-[2rem] rounded-tl-none text-slate-700 leading-relaxed text-sm border border-slate-100 shadow-sm">
            <div class="message-content">${formatText(text)}</div>
        </div>
    `;
    
    chatContainer.appendChild(div);
    highlightCode(div);
    scrollToBottom();
    return div;
}

function addSystemMessage(text) {
    const div = document.createElement('div');
    div.className = "flex justify-center my-4";
    div.innerHTML = `<span class="bg-rose-50 text-rose-600 text-[10px] font-bold px-4 py-1.5 rounded-full border border-rose-100 uppercase tracking-widest shadow-sm">${text}</span>`;
    chatContainer.appendChild(div);
    scrollToBottom();
}

function renderMessageImage(msgElement, url) {
    const content = msgElement.querySelector('.message-content');
    const img = document.createElement('img');
    img.src = url;
    img.className = "mt-4 rounded-3xl shadow-xl border border-slate-100 hover:scale-[1.02] transition-transform";
    content.appendChild(img);
}

function renderMessageTools(msgElement, rawText) {
    const bubble = msgElement.querySelector('.message-bubble');
    const tools = document.createElement('div');
    tools.className = "message-tools";
    
    const ttsBtn = createToolBtn('fa-volume-high', 'Listen', async () => {
        const icon = ttsBtn.querySelector('i');
        icon.className = 'fa-solid fa-spinner fa-spin';
        try {
            const res = await fetch('/api/speech', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: rawText })
            });
            const blob = await res.blob();
            const audio = new Audio(URL.createObjectURL(blob));
            audio.play();
            audio.onended = () => icon.className = 'fa-solid fa-volume-high';
        } catch (e) {
            icon.className = 'fa-solid fa-volume-high';
        }
    });

    const copyBtn = createToolBtn('fa-copy', 'Copy', () => {
        navigator.clipboard.writeText(rawText);
        const icon = copyBtn.querySelector('i');
        icon.className = 'fa-solid fa-check text-green-500';
        setTimeout(() => icon.className = 'fa-solid fa-copy', 2000);
    });

    tools.appendChild(ttsBtn);
    tools.appendChild(copyBtn);
    bubble.appendChild(tools);
}

function createToolBtn(iconClass, title, onClick) {
    const btn = document.createElement('button');
    btn.className = "tool-btn text-xs";
    btn.title = title;
    btn.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
    btn.onclick = onClick;
    return btn;
}

function showTypingLoader() {
    const id = 'loader-' + Date.now();
    const div = document.createElement('div');
    div.id = id;
    div.className = "flex flex-col items-start message animate-pulse";
    div.innerHTML = `
        <div class="flex items-center gap-2 mb-2 px-1 text-slate-300">
            <i class="fa-solid fa-robot text-xs"></i>
            <span class="text-[10px] font-bold uppercase tracking-widest italic">Computing...</span>
        </div>
        <div class="typing-indicator flex gap-1.5">
            <div class="typing-dot rounded-full"></div>
            <div class="typing-dot rounded-full"></div>
            <div class="typing-dot rounded-full"></div>
        </div>`;
    chatContainer.appendChild(div);
    scrollToBottom();
    return id;
}

function removeTypingLoader(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function formatText(text) {
    if (!text) return "";
    marked.setOptions({ breaks: true, gfm: true });
    return marked.parse(text);
}

function highlightCode(element) {
    element.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
        const pre = block.parentElement;
        if (!pre.querySelector('.copy-code-btn')) {
            const btn = document.createElement('button');
            btn.className = "copy-code-btn absolute top-3 right-3 p-2 rounded-xl bg-white/10 text-white/50 hover:bg-white/20 hover:text-white transition-all text-sm";
            btn.innerHTML = '<i class="fa-solid fa-copy"></i>';
            btn.onclick = () => {
                navigator.clipboard.writeText(block.innerText);
                btn.innerHTML = '<i class="fa-solid fa-check text-green-400"></i>';
                setTimeout(() => btn.innerHTML = '<i class="fa-solid fa-copy"></i>', 2000);
            };
            pre.classList.add('relative');
            pre.appendChild(btn);
        }
    });
}

function scrollToBottom() {
    setTimeout(() => { chatContainer.scrollTop = chatContainer.scrollHeight; }, 100);
}

userInput.focus();
