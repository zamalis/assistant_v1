import type { Env } from '../../schemas';

import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOpenAI } from '@langchain/openai';
import { inject, injectable } from 'tsyringe';

import { LlmModel } from '../../enums';
import { ENV } from '../../tokens';

@injectable()
export class LlmProviderService {
    private readonly models: Map<string, BaseChatModel>;

    constructor(@inject(ENV) private readonly env: Env) {
        this.models = new Map([
            [
                LlmModel.GPT_4O,
                new ChatOpenAI({
                    model: LlmModel.GPT_4O,
                    apiKey: this.env.OPENAI_API_KEY,
                }),
            ],
        ]);
    }

    public getModel(model: string): BaseChatModel {
        const choosenModel = this.models.get(model);
        if (!choosenModel) {
            throw new Error(`Model ${model} not found`);
        }
        return choosenModel;
    }
}
