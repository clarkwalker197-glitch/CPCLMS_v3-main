"use client";

import { useEffect, useState } from "react";

export const SUCCESS_MESSAGE_DURATION = 4000;

export function useTimedMessage() {
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), SUCCESS_MESSAGE_DURATION);
    return () => window.clearTimeout(timer);
  }, [message]);

  return [message, setMessage] as const;
}
