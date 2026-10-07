import type { Metadata } from "next";
import { Chat } from "@/components/chat";

export const metadata: Metadata = { title: "QA chat · web3lane", robots: { index: false, follow: false } };
export default function Page() { return <Chat />; }
