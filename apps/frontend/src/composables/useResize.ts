import type { BuddySshMessage } from '@buddy-ssh/shared'

export interface ResizeMeasurement {
  cols: number
  rows: number
  pixelWidth?: number
  pixelHeight?: number
}

export interface ResizeObserverLike {
  observe(target: Element): void
  disconnect(): void
}

export interface ResizeTransport {
  send(message: BuddySshMessage): void
}

export interface UseResizeOptions {
  element: HTMLElement
  transport: ResizeTransport
  measure: () => ResizeMeasurement
  createObserver?: (callback: ResizeObserverCallback) => ResizeObserverLike
  delayMs?: number
}

export interface UseResizeHandle {
  dispose(): void
}

// useResize observes a terminal container and sends debounced RESIZE frames.
export function useResize(options: UseResizeOptions): UseResizeHandle {
  const delayMs = options.delayMs ?? 50
  let lastMeasurement: ResizeMeasurement | undefined
  let resizeTimer: ReturnType<typeof setTimeout> | undefined
  const observer = (options.createObserver ?? defaultCreateObserver)(() => {
    if (resizeTimer) {
      clearTimeout(resizeTimer)
    }

    resizeTimer = setTimeout(() => {
      const measurement = options.measure()
      if (sameMeasurement(lastMeasurement, measurement)) {
        return
      }

      lastMeasurement = measurement
      try {
        options.transport.send({
          v: 1,
          type: 'RESIZE',
          payload: measurement,
        })
      } catch {
        // Ignore late resize events after the websocket has already closed.
      }
    }, delayMs)
  })

  observer.observe(options.element)

  return {
    dispose() {
      if (resizeTimer) {
        clearTimeout(resizeTimer)
        resizeTimer = undefined
      }
      observer.disconnect()
    },
  }
}

function sameMeasurement(
	previous: ResizeMeasurement | undefined,
	current: ResizeMeasurement,
): boolean {
  if (
    previous?.pixelWidth != null &&
    previous?.pixelHeight != null &&
    current.pixelWidth != null &&
    current.pixelHeight != null
  ) {
    return (
      previous.pixelWidth === current.pixelWidth &&
      previous.pixelHeight === current.pixelHeight
    )
  }

	return (
		previous?.cols === current.cols &&
		previous?.rows === current.rows &&
		previous?.pixelWidth === current.pixelWidth &&
		previous?.pixelHeight === current.pixelHeight
	)
}

function defaultCreateObserver(callback: ResizeObserverCallback): ResizeObserverLike {
  return new ResizeObserver(callback)
}
