require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
} = require('docx');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ── Multer — memory storage ───────────────────────────────────────────────────
const upload = multer({ storage: multer.memoryStorage() });

// ── Temp dir for generated DOCX files ────────────────────────────────────────
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// ── Helpers ───────────────────────────────────────────────────────────────────
async function extractText(buffer, mimetype, originalname) {
  if (mimetype === 'application/pdf') {
    const data = await pdfParse(buffer);
    return data.text;
  }
  if (
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    originalname.toLowerCase().endsWith('.docx')
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  if (mimetype === 'text/plain' || originalname.toLowerCase().endsWith('.txt')) {
    return buffer.toString('utf-8');
  }
  throw new Error('Unsupported file format. Please upload a .docx, .pdf, or .txt file.');
}

function getAlignment(alignStr) {
  switch (alignStr) {
    case 'center': return AlignmentType.CENTER;
    case 'right': return AlignmentType.RIGHT;
    default: return AlignmentType.LEFT;
  }
}

// ── Route 1: POST /api/extract ────────────────────────────────────────────────
// Receives the uploaded file, extracts plain text, returns it to the frontend.
// The frontend then calls Puter AI (in the browser) with this text.
app.post('/api/extract', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const rawText = await extractText(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname
    );

    if (!rawText || rawText.trim().length === 0) {
      return res.status(400).json({
        error: 'Could not extract text from the document, or the document is empty.',
      });
    }

    return res.json({ rawText });
  } catch (err) {
    console.error('Error in /api/extract:', err);
    return res.status(500).json({ error: err.message || 'Failed to extract document text.' });
  }
});

// ── Route 2: POST /api/generate ───────────────────────────────────────────────
// Receives the JSON layout (produced by Puter AI on the frontend),
// builds a formatted DOCX, saves it, and returns a download token.
app.post('/api/generate', async (req, res) => {
  try {
    const { layout } = req.body;

    if (!layout || !layout.sections) {
      return res.status(400).json({ error: 'Invalid layout data received.' });
    }

    const docChildren = [];

    // Title
    if (layout.title) {
      docChildren.push(new Paragraph({
        text: layout.title,
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
      }));
    }

    // Sections
    if (Array.isArray(layout.sections)) {
      layout.sections.forEach((section) => {
        const align = getAlignment(section.align);

        if (section.type === 'header') {
          docChildren.push(new Paragraph({
            text: section.content || '',
            heading: HeadingLevel.HEADING_1,
            alignment: align,
          }));

        } else if (section.type === 'heading') {
          const levelMap = {
            1: HeadingLevel.HEADING_1,
            2: HeadingLevel.HEADING_2,
            3: HeadingLevel.HEADING_3,
          };
          docChildren.push(new Paragraph({
            text: section.content || '',
            heading: levelMap[section.level] || HeadingLevel.HEADING_2,
            alignment: align,
          }));

        } else if (section.type === 'paragraph') {
          docChildren.push(new Paragraph({
            children: [new TextRun({ text: section.content || '' })],
            alignment: align,
          }));

        } else if (section.type === 'list' && Array.isArray(section.items)) {
          section.items.forEach((item) => {
            docChildren.push(new Paragraph({
              text: item,
              bullet: section.ordered ? undefined : { level: 0 },
              numbering: section.ordered
                ? { reference: 'default-numbering', level: 0 }
                : undefined,
            }));
          });
        }
      });
    }

    // Assemble DOCX
    const doc = new Document({
      numbering: {
        config: [{
          reference: 'default-numbering',
          levels: [{
            level: 0,
            format: 'decimal',
            text: '%1.',
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          }],
        }],
      },
      sections: [{ properties: {}, children: docChildren }],
    });

    const docBuffer = await Packer.toBuffer(doc);

    // Save to temp dir
    const fileId = uuidv4();
    const tempFilePath = path.join(tempDir, `${fileId}.docx`);
    fs.writeFileSync(tempFilePath, docBuffer);

    // Auto-delete after 10 minutes
    setTimeout(() => fs.unlink(tempFilePath, () => { }), 10 * 60 * 1000);

    return res.json({ downloadId: fileId });
  } catch (err) {
    console.error('Error in /api/generate:', err);
    return res.status(500).json({ error: err.message || 'Failed to generate document.' });
  }
});

// ── Route 3: GET /api/download/:id ────────────────────────────────────────────
app.get('/api/download/:id', (req, res) => {
  const fileId = req.params.id;

  if (!/^[0-9a-f-]{36}$/.test(fileId)) {
    return res.status(400).json({ error: 'Invalid file ID.' });
  }

  const filePath = path.join(tempDir, `${fileId}.docx`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found or already downloaded.' });
  }

  res.download(filePath, 'Formatted_Document.docx', (err) => {
    if (err) console.error('Download error:', err);
    fs.unlink(filePath, (unlinkErr) => {
      if (unlinkErr) console.error('Error deleting temp file:', unlinkErr);
    });
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(port, () => {
  console.log(`AI Document Formatter server running on http://localhost:${port}`);
});