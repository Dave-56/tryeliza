// Thread processing tracker
function calculateThreadMetrics(threads: Array<{
  thread_id: string;
  participants: Array<{ email: string }>;
  is_duplicate_of?: string;
}>) {
  const uniqueSenders = new Set(
    threads.flatMap(t => t.participants)
      .filter(p => p.role === 'from')
      .map(p => p.email)
  );

  return {
    total_threads_processed: threads.length,
    duplicate_threads_count: threads.filter(t => t.is_duplicate_of).length,
    unique_senders_count: uniqueSenders.size
  };
}

// Content signature generator
function generateContentSignature(thread: {
  subject: string;
  insights: { key_highlights?: string[] };
}) {
  return [
    thread.subject?.toLowerCase().trim(),
    thread.insights?.key_highlights?.[0]?.toLowerCase().trim()
  ].filter(Boolean).join('|');
}

// Duplication Detection
function findDuplicateThreads(threads: Array<{
  thread_id: string;
  content_signature: string;
}>) {
  const signatures = new Map<string, string>(); // signature -> original thread_id
  
  return threads.map(thread => {
    const originalThreadId = signatures.get(thread.content_signature);
    if (originalThreadId && originalThreadId !== thread.thread_id) {
      return { ...thread, is_duplicate_of: originalThreadId };
    }
    signatures.set(thread.content_signature, thread.thread_id);
    return thread;
  });
}