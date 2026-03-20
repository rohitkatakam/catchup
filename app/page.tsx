"use client";

import { useState } from "react";

export default function Home() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setErrorMessage("");

    const formData = new FormData(e.currentTarget);
    const author = formData.get("author")?.toString();
    const content = formData.get("content")?.toString();

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author, content }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setErrorMessage(data?.error?.message || "Something went wrong.");
        return;
      }

      setStatus("success");
    } catch {
      setStatus("error");
      setErrorMessage("Something went wrong.");
    }
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center min-h-screen bg-zinc-950 font-sans p-4">
      <main className="w-full max-w-lg p-8 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl">
        <h1 className="text-2xl font-semibold mb-6 text-zinc-100">Weekly Dispatch</h1>
        
        {status === "success" ? (
          <div role="status" aria-live="polite" className="p-4 bg-green-950/50 border border-green-900 rounded-lg text-green-400">
            <h2 className="font-medium mb-1">Success!</h2>
            <p className="text-sm">Your update has been submitted for this week.</p>
            <button 
              onClick={() => setStatus("idle")}
              className="mt-4 text-sm font-medium underline"
            >
              Submit another
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5" aria-busy={status === "loading"}>
            <div className="flex flex-col gap-2">
              <label htmlFor="author" className="text-sm font-medium text-zinc-300">
                Author
              </label>
              <select 
                id="author"
                name="author"
                required
                defaultValue=""
                className="p-3 bg-zinc-950 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-600 focus:border-transparent appearance-none"
              >
                <option value="" disabled>Select author...</option>
                <option value="Alice">Alice</option>
                <option value="Bob">Bob</option>
                <option value="Charlie">Charlie</option>
                <option value="Dave">Dave</option>
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="content" className="text-sm font-medium text-zinc-300">
                Your Update
              </label>
              <textarea
                id="content"
                name="content"
                required
                rows={5}
                placeholder="What did you do this week?"
                className="p-3 bg-zinc-950 border border-zinc-700 rounded-lg text-zinc-100 resize-y focus:outline-none focus:ring-2 focus:ring-zinc-600 focus:border-transparent placeholder:text-zinc-600"
              />
            </div>

            {status === "error" && (
              <div role="alert" className="text-sm text-red-400 font-medium">
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={status === "loading"}
              className="mt-2 w-full p-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-950 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === "loading" ? "Submitting..." : "Submit"}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
