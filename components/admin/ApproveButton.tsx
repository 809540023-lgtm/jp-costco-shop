"use client";
import { useRouter } from "next/navigation";

export default function ApproveButton({ id }: { id: string }) {
  const router = useRouter();
  async function onClick() {
    await fetch("/api/admin/products/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    router.refresh();
  }
  return <button onClick={onClick} className="btn btn-primary">核准</button>;
}
