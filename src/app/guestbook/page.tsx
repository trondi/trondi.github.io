import { Guestbook } from "@/components/blog/guestbook";

export const metadata = {
  title: "Guestbook",
  description: "방명록 — 자유롭게 한마디 남겨주세요.",
};

export default function GuestbookPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <header className="border-b border-border pb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Guestbook
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground">
          방명록
        </h1>
        <p className="mt-5 text-lg leading-8 text-muted-foreground">
          블로그에 들렀다면 자유롭게 한마디 남겨주세요. 로그인 없이 작성할 수 있습니다.
        </p>
      </header>

      <div className="mt-10">
        <Guestbook />
      </div>
    </div>
  );
}
