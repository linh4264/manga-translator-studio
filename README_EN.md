# 📚 Manga Translator Studio - AI Translation & Typesetting Tool

[![Vietnamese](https://img.shields.io/badge/Language-Tiếng%20Việt-red)](README.md)
[![English](https://img.shields.io/badge/Language-English-blue)](#)

![Manga Translator Studio Banner](https://img.shields.io/badge/Manga%20Translator-Studio-indigo?style=for-the-badge&logo=google-gemini)
![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)
![AI Powered](https://img.shields.io/badge/AI-Google%20Gemini%203.1-orange?style=for-the-badge&logo=google)

> [!NOTE]
> **Vietnamese Version**: [README.md](README.md) is available for Vietnamese-speaking users.

### 📸 Translation Preview

![Manga Translation Demo](public/demo.jpg)

**Manga Translator Studio** is a professional web application designed for automatic translation and typesetting of comic books (*Manga, Manhua, Manhwa, Comic, Scanlation*). Leveraging Google's state-of-the-art multimodal AI **Google Gemini** (Gemini 3.1 Flash-Lite, Gemini 3.5 Flash, Gemini Pro...), this tool automatically detects speech bubbles (OCR), translates them into natural target languages while preserving comic writing styles, and automatically typesets the translated text to fit perfectly inside the bubbles.

---

## ✨ Features

- 🌐 **Simple UI Internationalization (i18n)**:
  - Toggle the entire Studio interface between **English** and **Vietnamese** with a single click in the Settings panel.
- 🤖 **Multi-Provider AI & Local LLM Integration**:
  - Connect with **Google Gemini**, **Anthropic Claude** (Claude 3.7/3.5 Sonnet), **OpenAI** (GPT-4o), and **Custom Local LLMs** (Ollama: `http://localhost:11434/v1`, LM Studio: `http://localhost:1234/v1`).
- 🧠 **Chapter Story Memory**:
  - Automatically chains summaries and character relationships from previous pages so the AI maintains contextual continuity from page 1 to the end of the chapter.
- 🧹 **AI-Powered Background Inpainting (Auto Clean)**:
  - The **🧹 Auto Clean** button automatically clears the original bubble text using context-aware fill, preserving borders and underlying artwork.
- 💥 **Advanced SFX & Styling Tools**:
  - Distinguish bubbles as `Dialogue` or `💥 SFX (Sound Effects)`. Adjust angle rotation (`Rotation Slider: -180° đến 180°`), vertical/horizontal layout, curved path (`Arc Slider`), stroke outlines, and text shadows.
- 🎨 **Robust Typeset & Canvas System**:
  - **Auto-fit Font Size**: Shrinks or grows text dynamically to fit bubble bounds.
  - **Vertical Text Support**: Auto-centers and wraps vertical columns (standard in traditional Manga/Manhua/Manhwa layouts).
  - Packed with professional comic book fonts: *Be Vietnam Pro, Bangers, Comic Neue, Caveat, Chakra Petch, Permanent Marker, Bungee, Saira Condensed, Nunito, Inter*.
  - Full customization of text color, background mask color & opacity, padding, line height, and letter spacing.
- 🖌️ **Manual Eraser Brush**:
  - Manually erase complex backgrounds or tricky SFX using customizable brush sizes and custom background colors (White/Black/Custom Eyedropper).
- ⚙️ **Advanced Translation Controls**:
  - **Glossary & Name Preservation**: Keep specific names/nouns untranslated (e.g., *Luffy, Zoro, Nami, Sakura*).
  - **Genre-Based Prompt Presets**: School life, Comedy, Shounen, Fantasy/Isekai, Horror, Drama, Romance...
  - **OCR Contrast Enhancer**: Enhances page contrast to help the AI detect faded text or stylized SFX.
- 📦 **Batch Operations & Output Packaging**:
  - Translate the entire chapter in one click with **Translate All**.
  - Review all pages in the chapter sequentially using **Preview/Reader Mode**.
  - Export final assets as individual images, packaged **ZIP** archives, or consolidated **HD PDFs** for tablets and Kindle readers.
  - **Backup & Restore**: Download progress as `.manga` or `.json` project files and resume anytime.
  - **Consistency Checker**: Scans the entire project for translation inconsistencies and glossary violations.

---

## 🔑 How to Get a Free Gemini API Key

Manga Translator Studio relies on the **Google Gemini API** for image recognition (OCR) and translation. You can get an API Key **100% free** from Google by following these steps:

### Step 1: Go to Google AI Studio
Visit: **[https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)**.

### Step 2: Sign In with your Google Account
Use any personal Gmail account to log in.

### Step 3: Create your API Key
1. In the Google AI Studio dashboard, click the **"Create API key"** button.
2. Choose **"Create API key in new project"** (or select an existing Google Cloud project).
3. Wait a few seconds for Google to generate your key.

### Step 4: Copy the API Key
Click **"Copy"** to save your new key (which starts with `AIzaSy...`).

> [!TIP]
> **Privacy Note**: Your API Key is saved securely directly inside your browser's local storage (`LocalStorage`). It is never uploaded to any intermediate servers.

---

## 🚀 How to Run the App

> [!IMPORTANT]
> **ES Modules Requirement**: Since this app is built with modern ES Modules (`import`/`export`), opening `index.html` directly using the `file://` protocol will result in CORS blocks. **You must run the application using a local web server.**

Choose one of these easy methods to run the app:

### Method 1: Launch in One Click (Recommended)
*   **On Windows:** Double-click the [start.bat](start.bat) script in the root directory. It automatically spins up a local web server (Node.js or Python) and opens the app at `http://localhost:3000`.
*   **On macOS/Linux:** Open a terminal in the project directory, grant execution permission with `chmod +x start.sh` (only needed once), then double-click or run `./start.sh`.

### Method 2: Run via Node.js Server
Open your Command Prompt / Terminal in the project folder and run:
```bash
node server.js
```
The zero-dependency static file server will launch and automatically open the application in your default browser.

### Method 3: Use VS Code Live Server Extension
1. Open the project folder in **VS Code**.
2. Install the **Live Server** extension (by *Ritwick Dey*).
3. Right-click [index.html](index.html) -> select **"Open with Live Server"** (or click **"Go Live"** in the status bar at the bottom right).

### Method 4: CLI Utilities
*   **Using npx:** Run `npx serve .` and open `http://localhost:3000`.
*   **Using Python:** Run `python -m http.server 3000` and open `http://localhost:3000`.

---

## 📖 Quick Start Guide

### 1. Configure the AI Settings
1. Open the **Settings** modal (click the gear icon in the toolbar or left panel).
2. Paste your **Gemini API Key** in the API Key input field.
3. Choose an **AI Model**:
   - `Gemini 3.1 Flash-Lite` *(Recommended)*: Very fast, generous rate limits, and provides natural comic-oriented translations.
   - `Gemini 3.5 Flash` / `Gemini 3 Flash Preview`: Excellent OCR accuracy and response speed.
   - `Gemini 3.1 Pro Preview` / `Gemini 2.5 Pro`: Ideal for complex prose, dialogue, or cultural localization.
4. Select your **Source Language** (`Japanese`, `Chinese`, `Korean`, `English`, or `Auto Detect`).
5. Select your **Target Language** (default is Vietnamese, supports English, Spanish, French, etc.).

### 2. Upload Pages & Translate
1. Drag and drop or click the **Upload** zone on the left sidebar to add manga images.
2. Select a page from the sidebar page list.
3. Click **"Translate this page"** or use the **"Translate All"** button to translate the entire chapter automatically.
4. The AI will extract the text, mask the background, and typeset the target translation over the page.

### 3. Polish & Typeset
- **Edit Text**: Click any text box on the canvas to edit the translation text, font styles, color, alignment, border stroke, and drop shadow.
- **Manual Bubble Addition**: Click **"Add Text Box"** to manually place boxes if the AI missed any dialogue.
- **Eraser Mode**: Toggle the eraser brush to manually wipe away raw text, background details, or complex SFX.

### 4. Rate-Limiting for Free API Keys
- If using Google's free tier, configure the API settings to have **Giãn cách gửi (API Delay): 8-12 seconds** and **Số lần thử lại (Max Retries): 5** to avoid `429 Too Many Requests` errors.

### 5. Export Assets
- Use **Preview** to read the translated chapter in full reader format.
- Click **Export ZIP** to download all final images in a single ZIP.
- Click **Export PDF** to output a tablet-optimized PDF file.
- Click **Backup** to export a `.manga` file to save your project state.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Description |
| :--- | :--- |
| `Ctrl + Z` / `Cmd + Z` | Undo the last action |
| `Ctrl + Y` / `Cmd + Y` | Redo the last action |
| `Tab` / `Shift + Tab` | Focus on the next / previous text block |
| `Ctrl + D` / `Cmd + D` | Duplicate the selected text block |
| `Delete` / `Backspace` | Delete the selected text block |
| Keys `[` / `]` | Decrease / Increase font size of the active block |
| `N` / `P` | Go to the Next / Previous page |
| `Arrow Keys (↑ ↓ ← →)` | Nudge the selected block position (Hold `Shift` to move faster) |

---

## ❓ FAQ & Troubleshooting

<details>
<summary><b>1. Is using the Gemini API Key free?</b></summary>
Yes! Google provides a generous free tier for personal projects (several requests per minute depending on the model). You can easily translate hundreds of pages daily without incurring charges.
</details>

<details>
<summary><b>2. Why am I getting "429 Too Many Requests" or "503 Service Unavailable" errors?</b></summary>
This indicates that the free API key quota is being saturated by rapid requests.
<br/><b>Solution:</b> Open the Settings dialog, find the <i>API Rate Limit</i> section, increase the <b>API Delay</b> (Giãn cách gửi) to 8-12 seconds, and set <b>Max Retries</b> (Số lần thử lại) to 5.
</details>

<details>
<summary><b>3. Are my uploaded images or keys stored on your server?</b></summary>
No. The entire application operates <b>locally in your browser (Client-side)</b>. No images or database objects are sent to any remote server except for direct API payloads routed from your browser to Google's official Gemini endpoint.
</details>

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
