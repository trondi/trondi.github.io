export const siteConfig = {
  title: "Trond Frontend Archive",
  description:
    "프론트엔드 개발 경험과 시행착오를 문서처럼 정리하는 개인 기술 블로그.",
  siteUrl: "https://example.com",
  author: {
    name: "Trond",
    role: "Frontend Developer",
    bio: "React, Next.js, TypeScript를 중심으로 UI와 문서성을 함께 다룹니다.",
    github: "https://github.com/trondi",
    email: "hello@example.com",
  },
  intro:
    "가독성과 탐색성을 우선으로, 구현 메모와 기술 문서를 차곡차곡 쌓아가는 프론트엔드 블로그.",
  primaryNav: [
    { label: "Home", href: "/" },
    { label: "Posts", href: "/posts" },
    { label: "About", href: "/about" },
  ],
  categories: [
    "Frontend",
    "React / Next.js",
    "JavaScript / TypeScript",
    "CSS / UI",
    "Trouble Shooting",
    "TIL",
    "Project",
  ],
} as const;
