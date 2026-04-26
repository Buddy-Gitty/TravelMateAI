import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import '../App.css';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';

const SYSTEM_PROMPT = `You are a professional document formatter.
Analyze the raw document text provided by the user and return ONLY a valid JSON object — no markdown fences, no explanation, nothing else.

The JSON must follow this exact structure:
{
  "docType": "resume" | "report" | "assignment" | "offer_letter" | "general",
  "title": "string",
  "sections": [
    {
      "type": "header" | "heading" | "paragraph" | "list",
      "content": "string",
      "items": ["string"],
      "level": 1 | 2 | 3,
      "ordered": true | false,
      "align": "left" | "center" | "right"
    }
  ]
}

Formatting rules:
- Detect the document type from content and structure.
- Use bullet lists (ordered: false) for skills, responsibilities, and features.
- Use numbered lists (ordered: true) for steps, procedures, and sequences.
- Use centered alignment for the document title, header, and contact info.
- Use heading level 1 for major sections, level 2 for sub-sections.
- Keep paragraphs for narrative content, descriptions, and body text.
- If the user provides instructions, follow them first and override these defaults.`;

function Formatter() {
  const [file, setFile] = useState(null);
  const [instruction, setInstruction] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [puterReady, setPuterReady] = useState(false);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  // Wait for puter.js to load from index.html script tag
  useEffect(() => {
    const check = setInterval(() => {
      if (window.puter) {
        setPuterReady(true);
        clearInterval(check);
      }
    }, 100);
    return () => clearInterval(check);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  // ── File handling ────────────────────────────────────────────────────────────
  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length > 0) handleFileSelection(e.dataTransfer.files[0]);
  };

  const handleFileInputChange = (e) => {
    if (e.target.files?.length > 0) handleFileSelection(e.target.files[0]);
  };

  const handleFileSelection = (selectedFile) => {
    setError('');
    setResult(null);
    const valid = ['text/plain', 'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!valid.includes(selectedFile.type) && !selectedFile.name.match(/\.(txt|pdf|docx)$/i)) {
      setError('Please upload a valid .txt, .pdf, or .docx file.');
      return;
    }
    setFile(selectedFile);
  };

  // ── Main submit ──────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!file) return setError('Please select a file to format.');
    if (!puterReady) return setError('Puter AI is still loading. Please wait a moment.');

    setLoading(true);
    setError('');
    setResult(null);

    try {
      // Step 1 — extract raw text from the file (backend)
      setLoadingStep('Extracting document text...');
      const formData = new FormData();
      formData.append('document', file);

      const extractRes = await axios.post('http://localhost:3001/api/extract', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const { rawText } = extractRes.data;

      // Step 2 — call Puter AI directly from the browser (free, no API key)
      setLoadingStep('Claude is formatting your document...');
      let userMessage = `Raw Document Text:\n\n${rawText}`;
      if (instruction.trim()) {
        userMessage += `\n\nUser Formatting Instructions:\n${instruction.trim()}`;
      }

      const aiResponse = await window.puter.ai.chat(
        `${SYSTEM_PROMPT}\n\n${userMessage}`,
        { model: 'claude-sonnet-4-5' }
      );

      // Extract text from Puter response
      const rawJson =
        typeof aiResponse === 'string'
          ? aiResponse
          : aiResponse?.message?.content?.[0]?.text ||
          aiResponse?.message?.content ||
          aiResponse?.content?.[0]?.text ||
          aiResponse?.text ||
          JSON.stringify(aiResponse);

      // Strip accidental markdown fences
      const cleanJson = rawJson
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      const layout = JSON.parse(cleanJson);

      // Step 3 — generate DOCX from layout (backend)
      setLoadingStep('Generating your formatted .docx file...');
      const generateRes = await axios.post('http://localhost:3001/api/generate', { layout });

      setResult({ layout, downloadId: generateRes.data.downloadId });

    } catch (err) {
      console.error(err);
      setError(
        err.response?.data?.error ||
        err.message ||
        'An error occurred while formatting the document.'
      );
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  const handleDownload = () => {
    if (result?.downloadId) {
      window.location.href = `http://localhost:3001/api/download/${result.downloadId}`;
    }
  };

  // ── Preview renderer ─────────────────────────────────────────────────────────
  const renderPreview = (layout) => {
    if (!layout?.sections) return null;
    return (
      <div className="doc-preview animate-fade-in mt-4">
        {layout.title && <h1 className="text-center">{layout.title}</h1>}
        {layout.sections.map((section, index) => {
          const alignClass = `text-${section.align || 'start'}`;
          if (section.type === 'header') {
            return <h1 key={index} className={alignClass}>{section.content}</h1>;
          }
          if (section.type === 'heading') {
            const HTag = `h${section.level || 2}`;
            return <HTag key={index} className={alignClass}>{section.content}</HTag>;
          }
          if (section.type === 'paragraph') {
            return <p key={index} className={alignClass}>{section.content}</p>;
          }
          if (section.type === 'list') {
            const ListTag = section.ordered ? 'ol' : 'ul';
            return (
              <ListTag key={index} className={alignClass}>
                {section.items?.map((item, i) => <li key={i}>{item}</li>)}
              </ListTag>
            );
          }
          return null;
        })}
      </div>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="app-container">
      <div className="d-flex justify-content-end p-3">
        <button className="btn btn-outline-light" onClick={handleLogout}>
          Logout
        </button>
      </div>
      <header className="text-center mb-5 animate-fade-in">
        <h1 className="header-title">AI Document Formatter</h1>
        <p className="header-subtitle fs-5">
          Upload your raw document and let Claude handle the formatting
        </p>
      </header>

      <div className="row justify-content-center">
        <div className="col-lg-8">
          <div className="glass-panel animate-fade-in">

            {error && (
              <div className="alert alert-danger" role="alert">
                <i className="bi bi-exclamation-triangle-fill me-2"></i>
                {error}
              </div>
            )}

            {/* Drop zone */}
            <div
              className={`drop-zone mb-4 ${isDragging ? 'active' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileInputChange}
                style={{ display: 'none' }}
                accept=".txt,.pdf,.docx"
              />
              <div className="drop-zone-icon">📄</div>
              <h4>{file ? file.name : 'Drag & Drop your document here'}</h4>
              <p className="text-secondary mb-0">or click to browse (.docx, .pdf, .txt)</p>
            </div>

            {/* Instruction box */}
            <div className="mb-4">
              <label htmlFor="instructions" className="form-label text-light">
                Formatting instructions (optional)
              </label>
              <textarea
                className="form-control custom-textarea"
                id="instructions"
                rows="3"
                placeholder="e.g., Use APA format, bold all section headings, make it one page..."
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
              />
            </div>

            {/* Loading steps indicator */}
            {loading && loadingStep && (
              <div className="alert alert-info d-flex align-items-center gap-2 mb-3" role="status">
                <div className="spinner-border spinner-border-sm text-info" />
                <span>{loadingStep}</span>
              </div>
            )}

            {/* Submit button */}
            <div className="d-grid">
              <button
                className="btn btn-gradient btn-lg d-flex justify-content-center align-items-center gap-2"
                onClick={handleSubmit}
                disabled={loading || !file || !puterReady}
              >
                {loading ? (
                  <>
                    <div className="spinner-border text-light" role="status">
                      <span className="visually-hidden">Loading...</span>
                    </div>
                    Processing with Claude...
                  </>
                ) : (
                  <>✨ Format Document</>
                )}
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* Preview + download */}
      {result?.layout && (
        <div className="row justify-content-center mt-5">
          <div className="col-lg-10">
            <div className="d-flex justify-content-between align-items-center mb-3 animate-fade-in">
              <h3 className="mb-0">Document Preview</h3>
              <button className="btn btn-success btn-lg" onClick={handleDownload}>
                ⬇️ Download .docx
              </button>
            </div>
            {renderPreview(result.layout)}
          </div>
        </div>
      )}
    </div>
  );
}

export default Formatter;
