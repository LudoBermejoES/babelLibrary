// Wire format mirrored from the server (doc 03 "TypeScript client contract").
export interface BookMeta {
  id: number;
  title: string;
  author: string;
  synopsis: string | null;
  epubUrl: string;
  spineColor: string | null; // '#RRGGBB'
  pageCount: number | null;
}
