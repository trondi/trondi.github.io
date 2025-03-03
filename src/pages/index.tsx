import Image from "next/image";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

export default function Home() {
  return (
    <main
      className={`flex min-h-screen flex-col items-center justify-between p-24 ${inter.className}`}
    >
      <div className={`border-2 border-amber-300 w-full `}>Banner</div>
      <div className={`border-2 border-amber-300 w-full `}>Category</div>
      <div className={`border-2 border-amber-300 w-full `}>Contents</div>
    </main>
  );
}
