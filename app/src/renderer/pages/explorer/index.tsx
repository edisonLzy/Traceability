import { Button } from "@renderer/components/ui/button";
import { Input } from "@renderer/components/ui/input";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import type { BrowserGuestMessage } from "@shared/browser-types";
import { useEffect, useRef, useState } from "react";

import { BrowserCommentComposer } from "./browser-comment-composer";
import { normalizeBrowserUrl } from "./browser-url";
import { BrowserWebviewController, type BrowserWebviewHost } from "./browser-webview";
import { ExplorerInteractionCoordinator } from "./explorer-interactions";

const INITIAL_URL = "https://localhost/";
const DEFAULT_TITLE = "New tab";
const MAX_ERROR_LENGTH = 240;

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Browser action failed.";
  return message.slice(0, MAX_ERROR_LENGTH);
}

export function ExplorerPage() {
  const { invoke } = useElectronIPC();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<BrowserWebviewController | null>(null);
  const interactionRef = useRef<ExplorerInteractionCoordinator | null>(null);
  const [address, setAddress] = useState(INITIAL_URL);
  const [url, setUrl] = useState(INITIAL_URL);
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [isLoading, setIsLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isGuestRegistered, setIsGuestRegistered] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingTransitioning, setIsRecordingTransitioning] = useState(false);
  const [selected, setSelected] = useState<Extract<
    BrowserGuestMessage,
    { type: "element-selected" }
  > | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let active = true;
    const updateNavigation = (controller: BrowserWebviewController) => {
      if (!active) return;
      setCanGoBack(controller.canGoBack());
      setCanGoForward(controller.canGoForward());
    };
    const interaction = new ExplorerInteractionCoordinator({
      startRecording: () => invoke("startBrowserRecording"),
      stopRecording: () => invoke("stopBrowserRecording"),
      unregisterGuest: () => invoke("unregisterBrowserGuest"),
      send: (command) => controllerRef.current?.send(command),
      createId: () => crypto.randomUUID(),
      now: () => new Date(),
      info: console.info.bind(console),
      onTransitionChange: (isTransitioning) => {
        if (active) setIsRecordingTransitioning(isTransitioning);
      },
    });
    interactionRef.current = interaction;

    const webviewHost: BrowserWebviewHost = {
      appendChild: (webview) => host.appendChild(webview as unknown as Node),
    };
    const controller = new BrowserWebviewController(webviewHost, {
      onDomReady: (webContentsId) => {
        void invoke("registerBrowserGuest", { webContentsId })
          .then(() => {
            if (active) setIsGuestRegistered(true);
          })
          .catch((registrationError: unknown) => {
            if (active) setError(errorMessage(registrationError));
          });
      },
      onLoadingChange: (loading) => {
        if (active) setIsLoading(loading);
        updateNavigation(controller);
      },
      onLoadFailure: (failure) => {
        if (active) {
          setError(errorMessage(new Error(`Browser failed to load: ${failure.errorDescription}`)));
        }
      },
      onTitleChange: (nextTitle) => {
        if (active) setTitle(nextTitle || DEFAULT_TITLE);
      },
      onNavigate: (nextUrl) => {
        if (!active) return;
        setUrl(nextUrl);
        setAddress(nextUrl);
        updateNavigation(controller);
      },
      onGuestMessage: (message) => {
        interaction.receiveGuestMessage(message);
        if (message.type === "element-selected" && active) {
          setSelected(interaction.selectedElement);
          setComment("");
        }
      },
    });
    controllerRef.current = controller;

    return () => {
      active = false;
      controllerRef.current = null;
      interactionRef.current = null;
      void interaction.unmount();
      controller.dispose();
    };
  }, []);

  const navigate = () => {
    const normalized = normalizeBrowserUrl(address);
    if (!normalized.ok) {
      setError(normalized.error);
      return;
    }
    setError(null);
    setAddress(normalized.url);
    setUrl(normalized.url);
    controllerRef.current?.navigate(normalized.url);
  };

  const runBrowserAction = (action: () => void | Promise<void>) => {
    setError(null);
    void Promise.resolve(action()).catch((actionError: unknown) =>
      setError(errorMessage(actionError)),
    );
  };

  const startRecording = () => {
    runBrowserAction(async () => {
      await interactionRef.current?.startRecording();
      setIsRecording(interactionRef.current?.isRecording ?? false);
    });
  };

  const stopRecording = () => {
    runBrowserAction(async () => {
      await interactionRef.current?.stopRecording();
      setIsRecording(interactionRef.current?.isRecording ?? false);
    });
  };

  const selectElement = () => {
    interactionRef.current?.selectElement();
    setError(null);
  };

  const cancelComment = () => {
    interactionRef.current?.cancelComment();
    setSelected(null);
    setComment("");
  };

  const submitComment = () => {
    interactionRef.current?.submitComment(comment);
    setSelected(interactionRef.current?.selectedElement ?? null);
    setComment("");
  };

  return (
    <div className="mx-auto flex min-h-full max-w-[1260px] flex-col gap-3 px-[22px] pt-[22px] pb-12">
      <header className="flex flex-wrap items-center gap-2 rounded-lg border border-hairline bg-surface-1 p-2">
        <Button
          size="icon-sm"
          variant="ghost"
          disabled={!canGoBack}
          onClick={() => {
            controllerRef.current?.goBack();
            setCanGoBack(controllerRef.current?.canGoBack() ?? false);
            setCanGoForward(controllerRef.current?.canGoForward() ?? false);
          }}
          aria-label="Back"
        >
          ←
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          disabled={!canGoForward}
          onClick={() => {
            controllerRef.current?.goForward();
            setCanGoBack(controllerRef.current?.canGoBack() ?? false);
            setCanGoForward(controllerRef.current?.canGoForward() ?? false);
          }}
          aria-label="Forward"
        >
          →
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => controllerRef.current?.reload()}
          aria-label="Reload"
        >
          ↻
        </Button>
        <form
          className="min-w-[220px] flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            navigate();
          }}
        >
          <Input
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            aria-label="Address"
            placeholder="https://example.com"
          />
        </form>
        <Button size="sm" variant="ghost" onClick={selectElement} disabled={!isGuestRegistered}>
          Select element
        </Button>
        <Button
          size="sm"
          variant={isRecording ? "danger" : "primary"}
          disabled={!isGuestRegistered || isRecordingTransitioning}
          onClick={isRecording ? stopRecording : startRecording}
        >
          {isRecording ? "Stop recording" : "Start recording"}
        </Button>
      </header>

      <div className="flex items-center gap-2 px-1 text-xs text-tertiary" aria-live="polite">
        <span className="truncate text-subtle">{title}</span>
        <span className="ml-auto shrink-0">{isLoading ? "Loading…" : url}</span>
      </div>
      {error ? (
        <p
          className="m-0 rounded-lg border border-[#b65c5c]/50 bg-[#3c1f24] px-3 py-2 text-xs text-[#f0b3b3]"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="relative min-h-[560px] flex-1 overflow-hidden rounded-lg border border-hairline bg-black">
        <div
          ref={hostRef}
          className="size-full [&>webview]:size-full"
          aria-label="Browser content"
        />
        {selected ? (
          <div className="absolute right-3 bottom-3 w-[min(360px,calc(100%-24px))]">
            <BrowserCommentComposer
              element={selected.element}
              value={comment}
              onChange={setComment}
              onCancel={cancelComment}
              onSubmit={submitComment}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
