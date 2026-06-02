export type DocumentBlockRole =
  | "title"
  | "noticeNumber"
  | "body"
  | "section"
  | "koreanItem"
  | "dashItem"
  | "tableRow"
  | "image"
  | "note";

export interface DocumentImageAsset {
  id: string;
  kind: "image";
  fileName: string;
  mimeType: string;
  bytes?: Uint8Array;
  url?: string;
  altText?: string;
}

export interface DocumentBlock {
  id: string;
  role: DocumentBlockRole;
  text: string;
  asset?: DocumentImageAsset;
}
