import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { Server } from 'http';

export interface SolverProgress {
  runId: number;
  stage: 'QUEUED' | 'PREPARING' | 'SOLVING' | 'BUILDING_PLANS' | 'COMPLETED' | 'FAILED';
  progress: number; // 0-100
  objective?: number;
  elapsed?: number; // seconds
  message?: string;
  solutionsFound?: number;
  timestamp?: string;
}

class SolverProgressService {
  private wss: WebSocketServer | null = null;
  private runConnections: Map<number, Set<WebSocket>> = new Map();

  /**
   * Initialize WebSocket server on the same HTTP server
   */
  initialize(server: Server): void {
    this.wss = new WebSocketServer({
      server,
      path: '/ws/solver-progress',
    });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      console.log('[WebSocket] New client connected');

      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'subscribe' && typeof message.runId === 'number') {
            this.subscribeToRun(ws, message.runId);
            ws.send(
              JSON.stringify({
                type: 'subscribed',
                runId: message.runId,
              }),
            );
          }
        } catch (error) {
          console.error('[WebSocket] Failed to parse message:', error);
        }
      });

      ws.on('close', () => {
        this.removeConnection(ws);
        console.log('[WebSocket] Client disconnected');
      });

      ws.on('error', (error) => {
        console.error('[WebSocket] Error:', error);
        this.removeConnection(ws);
      });
    });

    console.log('[WebSocket] Solver progress WebSocket server initialized at /ws/solver-progress');
  }

  /**
   * Subscribe a WebSocket connection to a run
   */
  private subscribeToRun(ws: WebSocket, runId: number): void {
    if (!this.runConnections.has(runId)) {
      this.runConnections.set(runId, new Set());
    }
    this.runConnections.get(runId)!.add(ws);
    console.log(`[WebSocket] Client subscribed to run ${runId}`);
  }

  /**
   * Remove a WebSocket connection from all runs
   */
  private removeConnection(ws: WebSocket): void {
    this.runConnections.forEach((connections, runId) => {
      if (connections.has(ws)) {
        connections.delete(ws);
        console.log(`[WebSocket] Client unsubscribed from run ${runId}`);
      }
      if (connections.size === 0) {
        this.runConnections.delete(runId);
      }
    });
  }

  /**
   * Broadcast progress to all clients subscribed to a run
   */
  broadcastProgress(progress: SolverProgress): void {
    const { runId } = progress;
    const connections = this.runConnections.get(runId);

    if (!connections || connections.size === 0) {
      return;
    }

    const message = JSON.stringify({
      type: 'progress',
      ...progress,
      timestamp: progress.timestamp || new Date().toISOString(),
    });

    connections.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });

    console.log(
      `[WebSocket] Broadcast progress to ${connections.size} clients for run ${runId}: ${progress.stage} ${progress.progress}%`,
    );
  }

  /**
   * Send completion message and clean up connections for a run
   */
  completeRun(runId: number, success: boolean, summary?: string): void {
    this.broadcastProgress({
      runId,
      stage: success ? 'COMPLETED' : 'FAILED',
      progress: 100,
      message: summary || (success ? '求解完成' : '求解失败'),
    });

    // Keep connection for a bit to ensure message is delivered, then cleanup
    setTimeout(() => {
      this.runConnections.delete(runId);
    }, 5000);
  }

  /**
   * Get WebSocket server instance
   */
  getServer(): WebSocketServer | null {
    return this.wss;
  }
}

export const solverProgressService = new SolverProgressService();
export default solverProgressService;

