import data from "../../reference-data/knowledge.json";

// Offline knowledge library. Canonical data: reference-data/knowledge.json.
export interface Article {
  id: string;
  title: string;
  tags: string[];
  text: string;
  sources: string[];
  review: "expert-reviewed" | "draft";
}

export const LIBRARY_UPDATED: string = data.updated;
export const ARTICLES = data.articles as unknown as Article[];
