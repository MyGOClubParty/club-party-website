import raw from './clubs.json';

/** 社团在本次活动中的角色。 */
export type ClubRole = 'host' | 'organizer' | 'co-organizer';

/** 单个社团的风采数据。 */
export interface Club {
  /** 目录名 / 数据键，同时用于图片目录 static/img/clubs/<slug>/ */
  slug: string;
  /** 社团全称 */
  name: string;
  /** logo 占位徽章上的缩写 */
  abbr: string;
  role: ClubRole;
  /** 角色的中文标签，如「主办单位」 */
  roleLabel: string;
  /** 社团主题色，用于卡片强调与占位图配色 */
  accent: string;
  /** 服务器内的展示项目 */
  project: string;
  summary: string;
  tags: string[];
  /** logo 图路径（相对 static） */
  logo: string;
  /** 封面图路径 */
  cover: string;
  /** 风采图列表；0 张时组件回落到 cover，1 张时不显示缩略图条，n 张时自动出现画廊 */
  images: string[];
  /** 对应的 docs 页面 */
  doc: string;
}

export interface ActivityMeta {
  name: string;
  fullName: string;
  clubCount: number;
  school: string;
  schoolLogo: string;
}

export const activity = raw.activity as ActivityMeta;

export const clubs = raw.clubs as unknown as Club[];

/** 角色 → 卡片上的着色 key（供 module css 使用）。 */
export const roleTone: Record<ClubRole, string> = {
  host: 'host',
  organizer: 'organizer',
  'co-organizer': 'coOrganizer',
};

/** 取社团展示用的图片列表：有 images 用 images，否则回落到封面。 */
export function galleryOf(club: Club): string[] {
  return club.images && club.images.length > 0 ? club.images : [club.cover];
}
