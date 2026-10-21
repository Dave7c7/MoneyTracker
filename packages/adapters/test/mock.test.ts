import { MockAdapter } from '../src/mock/index.ts';
import { describeAdapterContract } from './contract.ts';

describeAdapterContract('mock', () => new MockAdapter());
