import type { Response } from 'express';

interface MCPConnection {
  userId: string;
  connectionId: string;
  connectedAt: Date;
  lastActivity: Date;
  response: Response;
}

export class MCPConnectionRegistry {
  private connections: Map<string, MCPConnection>;
  private static readonly STALE_CONNECTION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  constructor() {
    this.connections = new Map();
  }

  /**
   * Register a new MCP SSE connection
   * @param userId - The user ID associated with this connection
   * @param response - The Express Response object for the SSE connection
   * @returns The generated connection ID
   */
  register(userId: string, response: Response): string {
    const connectionId = `${userId}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    this.connections.set(connectionId, {
      userId,
      connectionId,
      connectedAt: new Date(),
      lastActivity: new Date(),
      response,
    });

    console.log(`[MCPConnectionRegistry] Registered connection ${connectionId} for user ${userId}`);
    return connectionId;
  }

  /**
   * Unregister a connection when it closes
   * @param connectionId - The connection ID to remove
   */
  unregister(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      this.connections.delete(connectionId);
      console.log(`[MCPConnectionRegistry] Unregistered connection ${connectionId}`);
    }
  }

  /**
   * Get all connections for a specific user
   * @param userId - The user ID to filter by
   * @returns Array of connections for the user
   */
  getByUserId(userId: string): MCPConnection[] {
    const userConnections: MCPConnection[] = [];

    for (const connection of this.connections.values()) {
      if (connection.userId === userId) {
        userConnections.push(connection);
      }
    }

    return userConnections;
  }

  /**
   * Terminate all connections for a specific user
   * Called when a new token is issued to force reconnection
   * @param userId - The user ID whose connections should be terminated
   * @returns The number of connections terminated
   */
  terminateByUserId(userId: string): number {
    const userConnections = this.getByUserId(userId);

    for (const connection of userConnections) {
      try {
        // End the SSE connection
        connection.response.end();
        this.connections.delete(connection.connectionId);
        console.log(`[MCPConnectionRegistry] Terminated connection ${connection.connectionId} for user ${userId}`);
      } catch (error) {
        console.error(`[MCPConnectionRegistry] Error terminating connection ${connection.connectionId}:`, error);
      }
    }

    return userConnections.length;
  }

  /**
   * Clean up stale connections that haven't had activity
   * Called periodically to prevent memory leaks
   */
  cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [connectionId, connection] of this.connections.entries()) {
      const timeSinceActivity = now - connection.lastActivity.getTime();

      if (timeSinceActivity > MCPConnectionRegistry.STALE_CONNECTION_TIMEOUT) {
        try {
          connection.response.end();
          this.connections.delete(connectionId);
          cleanedCount++;
          console.log(`[MCPConnectionRegistry] Cleaned up stale connection ${connectionId} (inactive for ${Math.floor(timeSinceActivity / 60000)} minutes)`);
        } catch (error) {
          console.error(`[MCPConnectionRegistry] Error cleaning up connection ${connectionId}:`, error);
        }
      }
    }

    if (cleanedCount > 0) {
      console.log(`[MCPConnectionRegistry] Cleaned up ${cleanedCount} stale connections`);
    }
  }

  /**
   * Update the last activity timestamp for a connection
   * @param connectionId - The connection ID to update
   */
  updateActivity(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.lastActivity = new Date();
    }
  }

  /**
   * Get the total number of active connections
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Get connection statistics for monitoring
   */
  getStats(): { total: number; byUser: Record<string, number> } {
    const byUser: Record<string, number> = {};

    for (const connection of this.connections.values()) {
      byUser[connection.userId] = (byUser[connection.userId] || 0) + 1;
    }

    return {
      total: this.connections.size,
      byUser,
    };
  }
}
