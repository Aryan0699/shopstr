import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { addToast } from "@heroui/react";
import { useFollowToggle } from "../use-follow-toggle";
import { FollowsContext } from "@/utils/context/context";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import type { FollowMutationResult } from "@/utils/nostr/nostr-helper-functions";

jest.mock("@heroui/react", () => ({
  addToast: jest.fn(),
}));

const targetPubkey =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function renderUseFollowToggle({
  directFollowList = [],
  isLoggedIn = true,
  addFollow = jest.fn().mockResolvedValue({
    ok: true,
    event: {},
    alreadyApplied: false,
  }),
  removeFollow = jest.fn().mockResolvedValue({
    ok: true,
    event: {},
    alreadyApplied: false,
  }),
  onRequireSignIn,
  onSuccess,
}: {
  directFollowList?: string[];
  isLoggedIn?: boolean;
  addFollow?: jest.Mock<Promise<FollowMutationResult>, [string]>;
  removeFollow?: jest.Mock<Promise<FollowMutationResult>, [string]>;
  onRequireSignIn?: jest.Mock;
  onSuccess?: jest.Mock;
} = {}) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SignerContext.Provider value={{ isLoggedIn }}>
      <FollowsContext.Provider
        value={{
          directFollowList,
          followList: directFollowList,
          firstDegreeFollowsLength: directFollowList.length,
          isLoading: false,
          addFollow,
          removeFollow,
        }}
      >
        {children}
      </FollowsContext.Provider>
    </SignerContext.Provider>
  );

  return {
    addFollow,
    removeFollow,
    ...renderHook(
      () => useFollowToggle(targetPubkey, { onRequireSignIn, onSuccess }),
      {
        wrapper,
      }
    ),
  };
}

describe("useFollowToggle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("requires sign-in before attempting a follow mutation", async () => {
    const onRequireSignIn = jest.fn();
    const { result, addFollow, removeFollow } = renderUseFollowToggle({
      isLoggedIn: false,
      onRequireSignIn,
    });

    let toggled = true;
    await act(async () => {
      toggled = await result.current.toggle();
    });

    expect(toggled).toBe(false);
    expect(onRequireSignIn).toHaveBeenCalledTimes(1);
    expect(addFollow).not.toHaveBeenCalled();
    expect(removeFollow).not.toHaveBeenCalled();
    expect(addToast).not.toHaveBeenCalled();
  });

  it("follows a seller and shows the success toast", async () => {
    const onSuccess = jest.fn();
    const { result, addFollow } = renderUseFollowToggle({ onSuccess });

    let toggled = false;
    await act(async () => {
      toggled = await result.current.toggle();
    });

    expect(toggled).toBe(true);
    expect(addFollow).toHaveBeenCalledWith(targetPubkey);
    expect(addToast).toHaveBeenCalledWith({
      title: "Following",
      color: "success",
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("unfollows a seller and shows the unfollow toast", async () => {
    const { result, removeFollow } = renderUseFollowToggle({
      directFollowList: [targetPubkey],
    });

    let toggled = false;
    await act(async () => {
      toggled = await result.current.toggle();
    });

    expect(toggled).toBe(true);
    expect(removeFollow).toHaveBeenCalledWith(targetPubkey);
    expect(addToast).toHaveBeenCalledWith({
      title: "Unfollowed merchant",
      color: "default",
    });
  });

  it("shows the specific verification failure toast when mutation is refused", async () => {
    const addFollow = jest.fn().mockResolvedValue({
      ok: false,
      reason: "unverified-contact-list",
    } satisfies FollowMutationResult);
    const { result } = renderUseFollowToggle({ addFollow });

    let toggled = true;
    await act(async () => {
      toggled = await result.current.toggle();
    });

    expect(toggled).toBe(false);
    expect(addToast).toHaveBeenCalledWith({
      title: "Could not verify your follow list — please try again.",
      color: "danger",
    });
  });

  it("shows a generic failure toast when the mutation throws", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const addFollow = jest.fn().mockRejectedValue(new Error("failed"));
    const { result } = renderUseFollowToggle({ addFollow });

    let toggled = true;
    await act(async () => {
      toggled = await result.current.toggle();
    });

    expect(toggled).toBe(false);
    expect(addToast).toHaveBeenCalledWith({
      title: "Follow action failed. Please try again.",
      color: "danger",
    });
    consoleErrorSpy.mockRestore();
  });
});
