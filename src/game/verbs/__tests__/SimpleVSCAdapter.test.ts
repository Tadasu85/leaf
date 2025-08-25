import { SimpleVSCAdapter } from '../SimpleVSCAdapter';
import { VerbResult, Effect } from '../VerbRuntime';

// Mock config
jest.mock('../../../config', () => ({
  vsc: {
    contractAddress: 'test-contract-123'
  }
}));

// Mock logger
jest.mock('../../../utils/Logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}));

describe('SimpleVSCAdapter', () => {
  let adapter: SimpleVSCAdapter;

  beforeEach(() => {
    adapter = new SimpleVSCAdapter();
  });

  afterEach(() => {
    adapter.disconnect();
  });

  describe('Initialization', () => {
    it('should initialize with correct status', () => {
      expect(adapter.isReady()).toBe(true);
      const status = adapter.getStatus();
      expect(status.connected).toBe(false);
      expect(status.contractId).toBe('test-contract-123');
    });
  });

  describe('Verb Execution', () => {
    it('should execute onEnter verb successfully', async () => {
      const result = await adapter.onEnter('tavern', 'alice');
      
      expect(result.success).toBe(true);
      expect(result.output).toContain("VSC verb 'on_enter' executed successfully");
      expect(result.timestamp).toBeDefined();
    });

    it('should execute onLeave verb successfully', async () => {
      const result = await adapter.onLeave('tavern', 'alice');
      
      expect(result.success).toBe(true);
      expect(result.output).toContain("VSC verb 'on_leave' executed successfully");
    });

    it('should execute onSay verb successfully', async () => {
      const result = await adapter.onSay('tavern', 'alice', 'Hello!');
      
      expect(result.success).toBe(true);
      expect(result.output).toContain("VSC verb 'on_say' executed successfully");
    });

    it('should execute onEmote verb successfully', async () => {
      const result = await adapter.onEmote('tavern', 'alice', 'waves');
      
      expect(result.success).toBe(true);
      expect(result.output).toContain("VSC verb 'on_emote' executed successfully");
    });

    it('should execute onCommand verb successfully', async () => {
      const result = await adapter.onCommand('tavern', 'alice', 'look');
      
      expect(result.success).toBe(true);
      expect(result.output).toContain("VSC verb 'on_command' executed successfully");
    });
  });

  describe('Event System', () => {
    it('should emit verb:executed events', async () => {
      const mockCallback = jest.fn();
      adapter.on('verb:executed', mockCallback);

      await adapter.onEnter('tavern', 'alice');

      expect(mockCallback).toHaveBeenCalledWith({
        verb: 'on_enter',
        params: { roomId: 'tavern', player: 'alice' },
        result: expect.objectContaining({
          success: true,
          output: expect.arrayContaining([expect.stringContaining('on_enter')])
        })
      });
    });

    it('should handle multiple event listeners', async () => {
      const mockCallback1 = jest.fn();
      const mockCallback2 = jest.fn();
      
      adapter.on('verb:executed', mockCallback1);
      adapter.on('verb:executed', mockCallback2);

      await adapter.onSay('tavern', 'alice', 'Hello');

      expect(mockCallback1).toHaveBeenCalled();
      expect(mockCallback2).toHaveBeenCalled();
    });

    it('should allow removing event listeners', async () => {
      const mockCallback = jest.fn();
      adapter.on('verb:executed', mockCallback);
      adapter.off('verb:executed', mockCallback);

      await adapter.onEnter('tavern', 'alice');

      expect(mockCallback).not.toHaveBeenCalled();
    });
  });

  describe('Subscription System', () => {
    it('should handle room subscriptions', () => {
      const mockHandlers = {
        onVerbOutput: jest.fn(),
        onRoomEffect: jest.fn()
      };

      const unsubscribe = adapter.subscribe('tavern', mockHandlers);
      expect(unsubscribe).toBeInstanceOf(Function);

      // Test that subscription was recorded
      unsubscribe();
    });

    it('should handle player subscriptions', () => {
      const mockHandlers = {
        onPlayerEffect: jest.fn()
      };

      const unsubscribe = adapter.subscribeToPlayer('alice', mockHandlers);
      expect(unsubscribe).toBeInstanceOf(Function);

      // Test that subscription was recorded
      unsubscribe();
    });
  });

  describe('Connection Management', () => {
    it('should connect automatically on first verb execution', async () => {
      expect(adapter.getStatus().connected).toBe(false);
      
      await adapter.onEnter('tavern', 'alice');
      
      expect(adapter.getStatus().connected).toBe(true);
    });

    it('should disconnect cleanly', () => {
      adapter.disconnect();
      
      const status = adapter.getStatus();
      expect(status.connected).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle errors gracefully', async () => {
      // Mock a scenario where verb execution might fail
      const mockCallback = jest.fn();
      adapter.on('verb:error', mockCallback);

      // The current implementation doesn't throw errors, but we can test the error event system
      // In a real implementation, this would test actual error scenarios
      
      expect(mockCallback).not.toHaveBeenCalled();
    });
  });
});
