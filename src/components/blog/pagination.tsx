type PaginationProps = {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

export function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const pages = Array.from({ length: totalPages }, (_, index) => index + 1);

  return (
    <div className="flex flex-wrap items-center gap-2 pt-8">
      {pages.map((page) => (
        <button
          key={page}
          type="button"
          onClick={() => onPageChange(page)}
          className={
            page === currentPage
              ? "rounded-full border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background"
              : "rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-[hsl(var(--ring)/0.4)] hover:text-foreground"
          }
        >
          {page}
        </button>
      ))}
    </div>
  );
}
