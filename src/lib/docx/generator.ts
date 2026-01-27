/**
 * DOCX generator service for exporting recordings with transcripts
 * Adapted from sgc-legal-ai project
 */

import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  TableRow,
  TableCell,
  Table,
  WidthType,
  BorderStyle,
  ShadingType,
  Packer,
  Footer,
  PageNumber,
  convertInchesToTwip,
} from "docx";

import type { Recording, Transcript, TranscriptSegment, Artifact, Speaker } from "@/types/database";

// Type definitions for parsed artifacts
interface SummaryArtifact {
  summary?: string;
  keyPoints?: string[];
  decisions?: string[];
  actionItems?: Array<{
    task: string;
    assignee?: string;
    deadline?: string;
    priority?: string;
  }>;
  topics?: string[];
}

interface ProtocolArtifact {
  title?: string;
  date?: string;
  participants?: string[];
  agenda?: string[];
  discussion?: Array<{
    topic?: string;
    content?: string;
  }>;
  conclusions?: string[];
  next_steps?: string[];
}

// Helper function to format duration
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

// Helper function to format timestamp for segments
function formatTimestamp(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

// Helper function to format file size
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Helper function to format date
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Generate title based on content analysis
function generateTitle(text: string): string {
  const textLower = text.toLowerCase().slice(0, 2000);

  const courtKeywords = ["суд", "судь", "истец", "ответчик", "заседани", "иск", "решени суда", "апелляци", "кассаци", "прокурор", "адвокат", "подсудим"];
  const meetingKeywords = ["совещани", "протокол", "повестка", "присутствовал", "слушали", "постановили", "решили", "собрани"];
  const negotiationKeywords = ["переговор", "договорил", "предложени", "условия сделк", "контракт", "соглашени"];
  const interviewKeywords = ["интервью", "вопрос:", "ответ:", "корреспондент", "журналист"];
  const lectureKeywords = ["лекци", "тема занятия", "студент", "преподаватель", "семинар"];

  const scores = {
    "ТРАНСКРИПЦИЯ СУДЕБНОГО ЗАСЕДАНИЯ": courtKeywords.filter(kw => textLower.includes(kw)).length,
    "ПРОТОКОЛ СОВЕЩАНИЯ": meetingKeywords.filter(kw => textLower.includes(kw)).length,
    "ТРАНСКРИПЦИЯ ПЕРЕГОВОРОВ": negotiationKeywords.filter(kw => textLower.includes(kw)).length,
    "ТРАНСКРИПЦИЯ ИНТЕРВЬЮ": interviewKeywords.filter(kw => textLower.includes(kw)).length,
    "ТРАНСКРИПЦИЯ ЛЕКЦИИ": lectureKeywords.filter(kw => textLower.includes(kw)).length,
  };

  const [bestTitle, bestScore] = Object.entries(scores).reduce(
    (max, [title, score]) => (score > max[1] ? [title, score] : max),
    ["ТРАНСКРИПЦИЯ АУДИОЗАПИСИ", 0]
  );

  return bestScore >= 2 ? bestTitle : "ТРАНСКРИПЦИЯ АУДИОЗАПИСИ";
}

// Get speaker name from speakers list
function getSpeakerName(speakerIndex: string, speakers: Speaker[]): string {
  // Parse speaker index (e.g., "Спикер 1" -> 1, or just "1" -> 1)
  const indexMatch = speakerIndex.match(/\d+/);
  if (indexMatch) {
    const index = parseInt(indexMatch[0], 10);
    const speaker = speakers.find(s => s.speaker_index === index);
    if (speaker?.name) {
      return speaker.name;
    }
  }
  return speakerIndex;
}

// Create document header
function createHeader(title: string, recording: Recording): Paragraph[] {
  return [
    // Title
    new Paragraph({
      children: [
        new TextRun({
          text: title,
          bold: true,
          size: 28, // 14pt
          font: "Times New Roman",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    // Recording title
    new Paragraph({
      children: [
        new TextRun({
          text: recording.title,
          bold: true,
          size: 24, // 12pt
          font: "Times New Roman",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),
  ];
}

// Create metadata section
function createMetadataSection(
  recording: Recording,
  transcript: Transcript | null,
  speakers: Speaker[]
): Paragraph[] {
  const items: Paragraph[] = [
    new Paragraph({
      children: [
        new TextRun({
          text: "ИНФОРМАЦИЯ О ЗАПИСИ",
          bold: true,
          size: 24,
          font: "Times New Roman",
        }),
      ],
      spacing: { before: 200, after: 200 },
    }),
  ];

  // File info
  const metaLines = [
    `Файл: ${recording.file_name}`,
    `Размер: ${formatFileSize(recording.file_size)}`,
    recording.duration_seconds ? `Длительность: ${formatDuration(recording.duration_seconds)}` : null,
    `Дата загрузки: ${formatDate(recording.created_at)}`,
    transcript ? `Слов в транскрипте: ${transcript.word_count.toLocaleString("ru-RU")}` : null,
    transcript?.language ? `Язык: ${transcript.language}` : null,
  ].filter(Boolean) as string[];

  metaLines.forEach(line => {
    items.push(
      new Paragraph({
        children: [
          new TextRun({
            text: line,
            size: 22, // 11pt
            font: "Times New Roman",
          }),
        ],
        spacing: { after: 60 },
      })
    );
  });

  // Speakers
  if (speakers.length > 0) {
    items.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "Участники:",
            bold: true,
            size: 22,
            font: "Times New Roman",
          }),
        ],
        spacing: { before: 200, after: 100 },
      })
    );

    speakers.forEach(speaker => {
      const speakerText = speaker.name
        ? `${speaker.name}${speaker.role ? ` (${speaker.role})` : ""}`
        : `Спикер ${speaker.speaker_index}`;

      items.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `• ${speakerText}`,
              size: 22,
              font: "Times New Roman",
            }),
          ],
          indent: { left: convertInchesToTwip(0.3) },
          spacing: { after: 40 },
        })
      );
    });
  }

  // Separator
  items.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "─".repeat(60),
          size: 16,
          font: "Times New Roman",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 300, after: 300 },
    })
  );

  return items;
}

// Create transcript section
function createTranscriptSection(
  transcript: Transcript,
  speakers: Speaker[]
): Paragraph[] {
  const items: Paragraph[] = [
    new Paragraph({
      children: [
        new TextRun({
          text: "ТРАНСКРИПТ",
          bold: true,
          size: 24,
          font: "Times New Roman",
        }),
      ],
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 300, after: 200 },
    }),
  ];

  // Check if we have segments with speaker info
  if (transcript.segments && transcript.segments.length > 0) {
    transcript.segments.forEach((segment: TranscriptSegment) => {
      const speakerName = getSpeakerName(segment.speaker, speakers);
      const timestamp = formatTimestamp(segment.start);

      // Speaker header with timestamp
      items.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `[${timestamp}] `,
              size: 20, // 10pt
              font: "Times New Roman",
              color: "666666",
            }),
            new TextRun({
              text: speakerName,
              bold: true,
              size: 22,
              font: "Times New Roman",
            }),
          ],
          spacing: { before: 200, after: 60 },
        })
      );

      // Segment text
      items.push(
        new Paragraph({
          children: [
            new TextRun({
              text: segment.text,
              size: 22,
              font: "Times New Roman",
            }),
          ],
          alignment: AlignmentType.JUSTIFIED,
          indent: { left: convertInchesToTwip(0.3) },
          spacing: { after: 120 },
        })
      );
    });
  } else if (transcript.full_text) {
    // Fallback to full text if no segments
    const paragraphs = transcript.full_text.split("\n\n").filter(p => p.trim());
    paragraphs.forEach(para => {
      items.push(
        new Paragraph({
          children: [
            new TextRun({
              text: para.trim(),
              size: 22,
              font: "Times New Roman",
            }),
          ],
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 200 },
        })
      );
    });
  }

  return items;
}

// Create summary section
function createSummarySection(summaryArtifact: Artifact): Paragraph[] {
  const items: Paragraph[] = [];

  let summary: SummaryArtifact;
  try {
    summary = JSON.parse(summaryArtifact.content) as SummaryArtifact;
  } catch {
    // If not JSON, treat as plain text
    items.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "РЕЗЮМЕ",
            bold: true,
            size: 24,
            font: "Times New Roman",
          }),
        ],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: summaryArtifact.content,
            size: 22,
            font: "Times New Roman",
          }),
        ],
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 200 },
      })
    );
    return items;
  }

  // Section header
  items.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "РЕЗЮМЕ",
          bold: true,
          size: 24,
          font: "Times New Roman",
        }),
      ],
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
    })
  );

  // Summary text
  if (summary.summary) {
    items.push(
      new Paragraph({
        children: [
          new TextRun({
            text: summary.summary,
            size: 22,
            font: "Times New Roman",
          }),
        ],
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 200 },
      })
    );
  }

  // Key Points
  if (summary.keyPoints && summary.keyPoints.length > 0) {
    items.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "Ключевые моменты:",
            bold: true,
            size: 22,
            font: "Times New Roman",
          }),
        ],
        spacing: { before: 200, after: 100 },
      })
    );

    summary.keyPoints.forEach(point => {
      items.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `• ${point}`,
              size: 22,
              font: "Times New Roman",
            }),
          ],
          indent: { left: convertInchesToTwip(0.3) },
          spacing: { after: 60 },
        })
      );
    });
  }

  // Decisions
  if (summary.decisions && summary.decisions.length > 0) {
    items.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "Принятые решения:",
            bold: true,
            size: 22,
            font: "Times New Roman",
          }),
        ],
        spacing: { before: 200, after: 100 },
      })
    );

    summary.decisions.forEach(decision => {
      items.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `• ${decision}`,
              size: 22,
              font: "Times New Roman",
            }),
          ],
          indent: { left: convertInchesToTwip(0.3) },
          spacing: { after: 60 },
        })
      );
    });
  }

  // Action Items
  if (summary.actionItems && summary.actionItems.length > 0) {
    items.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "Задачи и поручения:",
            bold: true,
            size: 22,
            font: "Times New Roman",
          }),
        ],
        spacing: { before: 200, after: 100 },
      })
    );

    summary.actionItems.forEach((item, index) => {
      const parts = [`${index + 1}. ${item.task}`];
      if (item.assignee) parts.push(`Ответственный: ${item.assignee}`);
      if (item.deadline) parts.push(`Срок: ${item.deadline}`);
      if (item.priority) parts.push(`Приоритет: ${item.priority}`);

      items.push(
        new Paragraph({
          children: [
            new TextRun({
              text: parts.join(" | "),
              size: 22,
              font: "Times New Roman",
            }),
          ],
          indent: { left: convertInchesToTwip(0.3) },
          spacing: { after: 80 },
        })
      );
    });
  }

  return items;
}

// Create protocol section
function createProtocolSection(protocolArtifact: Artifact): Paragraph[] {
  const items: Paragraph[] = [];

  let protocol: ProtocolArtifact;
  try {
    protocol = JSON.parse(protocolArtifact.content) as ProtocolArtifact;
  } catch {
    // If not JSON, treat as plain text
    items.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "ПРОТОКОЛ",
            bold: true,
            size: 24,
            font: "Times New Roman",
          }),
        ],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: protocolArtifact.content,
            size: 22,
            font: "Times New Roman",
          }),
        ],
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 200 },
      })
    );
    return items;
  }

  // Section header
  items.push(
    new Paragraph({
      children: [
        new TextRun({
          text: protocol.title || "ПРОТОКОЛ ВСТРЕЧИ",
          bold: true,
          size: 24,
          font: "Times New Roman",
        }),
      ],
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 200 },
    })
  );

  // Date
  if (protocol.date) {
    items.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Дата: ${protocol.date}`,
            size: 22,
            font: "Times New Roman",
          }),
        ],
        spacing: { after: 100 },
      })
    );
  }

  // Participants
  if (protocol.participants && protocol.participants.length > 0) {
    items.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "Участники:",
            bold: true,
            size: 22,
            font: "Times New Roman",
          }),
        ],
        spacing: { before: 200, after: 100 },
      })
    );

    protocol.participants.forEach(participant => {
      items.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `• ${participant}`,
              size: 22,
              font: "Times New Roman",
            }),
          ],
          indent: { left: convertInchesToTwip(0.3) },
          spacing: { after: 40 },
        })
      );
    });
  }

  // Agenda
  if (protocol.agenda && protocol.agenda.length > 0) {
    items.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "Повестка:",
            bold: true,
            size: 22,
            font: "Times New Roman",
          }),
        ],
        spacing: { before: 200, after: 100 },
      })
    );

    protocol.agenda.forEach((item, index) => {
      items.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${index + 1}. ${item}`,
              size: 22,
              font: "Times New Roman",
            }),
          ],
          indent: { left: convertInchesToTwip(0.3) },
          spacing: { after: 60 },
        })
      );
    });
  }

  // Discussion
  if (protocol.discussion && protocol.discussion.length > 0) {
    items.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "Обсуждение:",
            bold: true,
            size: 22,
            font: "Times New Roman",
          }),
        ],
        spacing: { before: 200, after: 100 },
      })
    );

    protocol.discussion.forEach(item => {
      if (item.topic) {
        items.push(
          new Paragraph({
            children: [
              new TextRun({
                text: item.topic,
                bold: true,
                size: 22,
                font: "Times New Roman",
              }),
            ],
            spacing: { before: 100, after: 60 },
          })
        );
      }
      if (item.content) {
        items.push(
          new Paragraph({
            children: [
              new TextRun({
                text: item.content,
                size: 22,
                font: "Times New Roman",
              }),
            ],
            alignment: AlignmentType.JUSTIFIED,
            indent: { left: convertInchesToTwip(0.3) },
            spacing: { after: 100 },
          })
        );
      }
    });
  }

  // Conclusions
  if (protocol.conclusions && protocol.conclusions.length > 0) {
    items.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "Выводы и решения:",
            bold: true,
            size: 22,
            font: "Times New Roman",
          }),
        ],
        spacing: { before: 200, after: 100 },
      })
    );

    protocol.conclusions.forEach((conclusion, index) => {
      items.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${index + 1}. ${conclusion}`,
              size: 22,
              font: "Times New Roman",
            }),
          ],
          indent: { left: convertInchesToTwip(0.3) },
          spacing: { after: 60 },
        })
      );
    });
  }

  // Next steps
  if (protocol.next_steps && protocol.next_steps.length > 0) {
    items.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "Дальнейшие шаги:",
            bold: true,
            size: 22,
            font: "Times New Roman",
          }),
        ],
        spacing: { before: 200, after: 100 },
      })
    );

    protocol.next_steps.forEach((step, index) => {
      items.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${index + 1}. ${step}`,
              size: 22,
              font: "Times New Roman",
            }),
          ],
          indent: { left: convertInchesToTwip(0.3) },
          spacing: { after: 60 },
        })
      );
    });
  }

  return items;
}

// Create footer
function createFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: "Документ создан в SGC Scribe | Страница ",
            size: 16,
            font: "Times New Roman",
            italics: true,
          }),
          new TextRun({
            children: [PageNumber.CURRENT],
            size: 16,
            font: "Times New Roman",
            italics: true,
          }),
          new TextRun({
            text: " из ",
            size: 16,
            font: "Times New Roman",
            italics: true,
          }),
          new TextRun({
            children: [PageNumber.TOTAL_PAGES],
            size: 16,
            font: "Times New Roman",
            italics: true,
          }),
        ],
        alignment: AlignmentType.CENTER,
      }),
    ],
  });
}

/**
 * Generate DOCX document from recording data
 */
export async function generateRecordingDocx(
  recording: Recording,
  transcript: Transcript | null,
  artifacts: Artifact[],
  speakers: Speaker[]
): Promise<Buffer> {
  const children: Paragraph[] = [];

  // Generate title based on content
  const title = transcript?.full_text
    ? generateTitle(transcript.full_text)
    : "ТРАНСКРИПЦИЯ АУДИОЗАПИСИ";

  // Header
  children.push(...createHeader(title, recording));

  // Metadata
  children.push(...createMetadataSection(recording, transcript, speakers));

  // Transcript
  if (transcript) {
    children.push(...createTranscriptSection(transcript, speakers));
  }

  // Summary
  const summaryArtifact = artifacts.find(a => a.type === "summary");
  if (summaryArtifact) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "─".repeat(60),
            size: 16,
            font: "Times New Roman",
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { before: 300, after: 300 },
      })
    );
    children.push(...createSummarySection(summaryArtifact));
  }

  // Protocol
  const protocolArtifact = artifacts.find(a => a.type === "protocol");
  if (protocolArtifact) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "─".repeat(60),
            size: 16,
            font: "Times New Roman",
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { before: 300, after: 300 },
      })
    );
    children.push(...createProtocolSection(protocolArtifact));
  }

  // Creation date footer
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "─".repeat(60),
          size: 16,
          font: "Times New Roman",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Документ создан: ${formatDate(new Date().toISOString())}`,
          size: 18,
          font: "Times New Roman",
          italics: true,
        }),
      ],
      alignment: AlignmentType.RIGHT,
    })
  );

  // Create document
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: "Times New Roman",
            size: 22, // 11pt
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(0.75),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1.25),
            },
          },
        },
        footers: {
          default: createFooter(),
        },
        children,
      },
    ],
  });

  // Generate buffer
  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}

/**
 * Generate filename for the document
 */
export function generateDocxFilename(recording: Recording): string {
  const date = new Date().toISOString().split("T")[0];
  const safeName = recording.title
    .replace(/[^a-zA-Zа-яА-ЯёЁ0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 50) || "recording";

  return `${safeName}-${date}.docx`;
}
