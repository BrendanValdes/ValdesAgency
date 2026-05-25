"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import BookingModal from "./BookingModal";

interface BookingContextValue {
  open: () => void;
  close: () => void;
}

const BookingContext = createContext<BookingContextValue | null>(null);

export function useBooking(): BookingContextValue {
  const ctx = useContext(BookingContext);
  if (!ctx) {
    throw new Error("useBooking must be used inside <BookingProvider>");
  }
  return ctx;
}

export default function BookingProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => {
    setIsOpen(true);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("valdes:snap-pause"));
    }
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("valdes:snap-resume"));
    }
  }, []);

  return (
    <BookingContext.Provider value={{ open, close }}>
      {children}
      <BookingModal open={isOpen} onClose={close} />
    </BookingContext.Provider>
  );
}
