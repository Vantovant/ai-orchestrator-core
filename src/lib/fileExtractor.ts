/**
 * Client-side text extraction for uploaded files.
 * PDF: pdfjs-dist (dynamic CDN import), DOCX: mammoth, Text-based: direct read.
 */

export async function extractTextFromFile(file: File): Promise<string> {
  const mime = file.type || "";
  const name = file.name.toLowerCase();

  // Text-based files
  if (
    mime.startsWith("text/") ||
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".csv") ||
    name.endsWith(".json") ||
    name.endsWith(".html") ||
    name.endsWith(".htm")
  ) {
    return await file.text();
  }

  // PDF
  if (mime === "application/pdf" || name.endsWith(".pdf")) {
    return await extractPdfText(file);
  }

  // DOCX
  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    return await extractDocxText(file);
  }

  return "";
}

async function extractPdfText(file: File): Promise<string> {
  try {
    // Dynamic CDN import to avoid Rollup resolution issues
    const PDFJS_VERSION = "4.9.155";
    const pdfjsLib = await import(
      /* @vite-ignore */
      `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.mjs`
    );
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.mjs`;

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map((item: any) => item.str || "")
        .join(" ");
      pages.push(text);
    }

    return pages.join("\n\n");
  } catch (e) {
    console.error("PDF extraction failed:", e);
    throw new Error("PDF text extraction failed");
  }
}

async function extractDocxText(file: File): Promise<string> {
  try {
    const mammoth = await import("mammoth");
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  } catch (e) {
    console.error("DOCX extraction failed:", e);
    throw new Error("DOCX text extraction failed");
  }
}

export function isExtractableFile(file: File): boolean {
  const name = file.name.toLowerCase();
  const extractable = [".pdf", ".docx", ".txt", ".md", ".csv", ".json", ".html", ".htm"];
  return extractable.some(ext => name.endsWith(ext));
}

export const ACCEPTED_FILE_TYPES = ".pdf,.docx,.txt,.md,.csv,.json,.html,.htm";
