import type { HydratedDocument } from 'mongoose';
import type { Block } from '../schemas/block.schema.js';

export type BlockDocument = HydratedDocument<Block>;
