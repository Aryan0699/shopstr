import { useEffect } from "react";
import { useRouter } from "next/router";
import { useDisclosure } from "@heroui/react";
import { useAuthStore } from "@/utils/stores/auth-store";

export function useAuthGuard() {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const isAuthStateResolved = useAuthStore((s) => s.isAuthStateResolved);
  const router = useRouter();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const hasResolvedAuthState = isAuthStateResolved ?? true;
  const isGuarded = hasResolvedAuthState && isLoggedIn === false;

  useEffect(() => {
    if (isGuarded) {
      onOpen();
    }
  }, [isGuarded, onOpen]);

  const handleClose = () => {
    onClose();
    router.replace("/marketplace");
  };

  return {
    isLoggedIn,
    isAuthResolved: hasResolvedAuthState,
    isGuarded,
    isOpen,
    handleClose,
  };
}
