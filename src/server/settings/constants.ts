export const SOCIAL_PLATFORMS = [
  { key: "facebook", label: "Facebook", placeholder: "https://facebook.com/..." },
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/..." },
  { key: "youtube", label: "YouTube", placeholder: "https://youtube.com/@..." },
  { key: "x", label: "X (Twitter)", placeholder: "https://x.com/..." },
  { key: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@..." },
  { key: "whatsapp", label: "WhatsApp Saluran", placeholder: "https://whatsapp.com/channel/..." },
] as const;

export type SocialKey = (typeof SOCIAL_PLATFORMS)[number]["key"];
export type SocialLinksInput = Partial<Record<SocialKey, string>>;
