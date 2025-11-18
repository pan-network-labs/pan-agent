'use client';

import { useState, useEffect } from 'react';
import { getLocale, useTranslations, type Locale } from '../lib/i18n';

interface AgentCard {
  '@context'?: string;
  '@type'?: string;
  name: string;
  description: string;
  version: string;
  capabilities: Capability[];
  endpoints: {
    task: string;
    agentCard: string;
  };
  payment?: {
    required: boolean;
    defaultPrice?: string;
    price?: string; // Backward compatibility
    currency: string;
    network: string;
    address?: string;
    minAmount?: string;
    pricingModel?: string;
    note?: string;
  };
  metadata?: Record<string, any>;
}

interface Capability {
  name: string;
  description: string;
  pricing?: {
    price: string;
    currency: string;
    network?: string;
    address?: string;
    note?: string;
  };
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
  outputSchema: {
    type: string;
    properties: Record<string, any>;
  };
}

interface AgentInfo {
  url: string;
  card: AgentCard | null;
  loading: boolean;
  error: string | null;
}

export default function AgentsPage() {
  const [currentLocale, setCurrentLocale] = useState<Locale>(() => {
    if (typeof window !== 'undefined') {
      return getLocale();
    }
    return 'en';
  });
  const { t } = useTranslations(currentLocale);

  const [agents, setAgents] = useState<AgentInfo[]>([
    {
      url: '/api/a2a-agent',
      card: null,
      loading: false,
      error: null,
    },
    {
      url: '/api/prompt-agent',
      card: null,
      loading: false,
      error: null,
    },
  ]);

  useEffect(() => {
    // Load all Agent card information
    agents.forEach((agent, index) => {
      loadAgentCard(agent.url, index);
    });
  }, []);

  const loadAgentCard = async (url: string, index: number) => {
    setAgents((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], loading: true, error: null };
      return updated;
    });

    try {
      // Use A2A protocol standard path /.well-known/agent.json
      const response = await fetch(`${url}/.well-known/agent.json`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const card = await response.json();
      
      setAgents((prev) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], card, loading: false };
        return updated;
      });
    } catch (error) {
      setAgents((prev) => {
        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to load',
        };
        return updated;
      });
    }
  };

  const formatSchema = (schema: any): string => {
    if (!schema || !schema.properties) return 'N/A';
    
    const props = Object.entries(schema.properties)
      .map(([key, value]: [string, any]) => {
        const required = schema.required?.includes(key) ? ' (required)' : ' (optional)';
        return `${key}: ${value.type || 'any'}${required}`;
      })
      .join(', ');
    
    return props || 'N/A';
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      {/* Navigation bar */}
      <nav className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <a href="/" className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                Pan Agent
              </a>
            </div>
            <div className="flex items-center space-x-4">
              <a
                href="/"
                className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 px-3 py-2 rounded-md text-sm font-medium"
              >
                {t('agents.imageGeneration')}
              </a>
              <a
                href="/agents"
                className="text-zinc-900 dark:text-zinc-100 px-3 py-2 rounded-md text-sm font-medium bg-zinc-100 dark:bg-zinc-800"
              >
                A2A Agents
              </a>
            </div>
          </div>
        </div>
      </nav>

      <div className="p-8">
        <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
            {t('agents.title')}
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            {t('agents.description')}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {agents.map((agent, index) => (
            <div
              key={index}
              className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg p-6 border border-zinc-200 dark:border-zinc-800"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                  {agent.card?.name || agent.url}
                </h2>
                {agent.loading && (
                  <span className="text-sm text-zinc-500">{t('agents.loading')}</span>
                )}
                {agent.error && (
                  <span className="text-sm text-red-500">{agent.error}</span>
                )}
              </div>

              {agent.card ? (
                <>
                  {/* Basic Information */}
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                      {t('agents.basicInfo')}
                    </h3>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="text-zinc-600 dark:text-zinc-400">{t('agents.description')}：</span>
                        <span className="text-zinc-900 dark:text-zinc-100 ml-2">
                          {agent.card.description}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-600 dark:text-zinc-400">{t('agents.version')}：</span>
                        <span className="text-zinc-900 dark:text-zinc-100 ml-2">
                          {agent.card.version}
                        </span>
                      </div>
                      {agent.card['@type'] && (
                        <div>
                          <span className="text-zinc-600 dark:text-zinc-400">{t('agents.type')}：</span>
                          <span className="text-zinc-900 dark:text-zinc-100 ml-2">
                            {agent.card['@type']}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Endpoints */}
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                      {t('agents.endpoints')}
                    </h3>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="text-zinc-600 dark:text-zinc-400">Task：</span>
                        <code className="ml-2 px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded text-xs">
                          {agent.card.endpoints.task}
                        </code>
                      </div>
                      <div>
                        <span className="text-zinc-600 dark:text-zinc-400">Agent Card：</span>
                        <code className="ml-2 px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded text-xs">
                          {agent.card.endpoints.agentCard}
                        </code>
                      </div>
                    </div>
                  </div>

                  {/* Capabilities */}
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
                      {t('agents.capabilities')} ({agent.card.capabilities.length})
                    </h3>
                    <div className="space-y-4">
                      {agent.card.capabilities.map((capability, capIndex) => (
                        <div
                          key={capIndex}
                          className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">
                                {capability.name}
                              </h4>
                              <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                                {capability.description}
                              </p>
                            </div>
                            {capability.pricing && (
                              <div className="ml-4 text-right">
                                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                  {capability.pricing.price === '0' ? (
                                    <span className="text-green-600 dark:text-green-400">{t('agents.free')}</span>
                                  ) : (
                                    <span>
                                      {capability.pricing.price} {capability.pricing.currency}
                                    </span>
                                  )}
                                </div>
                                {capability.pricing.note && (
                                  <div className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">
                                    {capability.pricing.note}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          
                          <div className="space-y-2 text-xs">
                            <div>
                              <span className="text-zinc-600 dark:text-zinc-400 font-medium">
                                {t('agents.inputParams')}：
                              </span>
                              <div className="mt-1 p-2 bg-zinc-50 dark:bg-zinc-800 rounded">
                                <code className="text-zinc-900 dark:text-zinc-100">
                                  {formatSchema(capability.inputSchema)}
                                </code>
                              </div>
                            </div>
                            <div>
                              <span className="text-zinc-600 dark:text-zinc-400 font-medium">
                                {t('agents.outputParams')}：
                              </span>
                              <div className="mt-1 p-2 bg-zinc-50 dark:bg-zinc-800 rounded">
                                <code className="text-zinc-900 dark:text-zinc-100">
                                  {formatSchema(capability.outputSchema)}
                                </code>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Payment Information */}
                  {agent.card.payment && (
                    <div className="mb-6">
                      <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                        {t('agents.paymentInfo')}
                      </h3>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="text-zinc-600 dark:text-zinc-400">{t('agents.required')}：</span>
                          <span className="text-zinc-900 dark:text-zinc-100 ml-2">
                            {agent.card.payment.required ? t('agents.yes') : t('agents.no')}
                          </span>
                        </div>
                        {(agent.card.payment.defaultPrice || agent.card.payment.price) && (
                          <div>
                            <span className="text-zinc-600 dark:text-zinc-400">{t('agents.defaultPrice')}：</span>
                            <span className="text-zinc-900 dark:text-zinc-100 ml-2">
                              {agent.card.payment.defaultPrice || agent.card.payment.price} {agent.card.payment.currency}
                            </span>
                          </div>
                        )}
                        {agent.card.payment.minAmount && (
                          <div>
                            <span className="text-zinc-600 dark:text-zinc-400">{t('agents.minAmount')}：</span>
                            <span className="text-zinc-900 dark:text-zinc-100 ml-2">
                              {agent.card.payment.minAmount} {agent.card.payment.currency}
                            </span>
                          </div>
                        )}
                        <div>
                          <span className="text-zinc-600 dark:text-zinc-400">{t('agents.network')}：</span>
                          <span className="text-zinc-900 dark:text-zinc-100 ml-2">
                            {agent.card.payment.network}
                          </span>
                        </div>
                        {agent.card.payment.address && (
                          <div>
                            <span className="text-zinc-600 dark:text-zinc-400">{t('agents.address')}：</span>
                            <code className="ml-2 px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded text-xs">
                              {agent.card.payment.address}
                            </code>
                          </div>
                        )}
                        {agent.card.payment.pricingModel && (
                          <div>
                            <span className="text-zinc-600 dark:text-zinc-400">{t('agents.pricingModel')}：</span>
                            <span className="text-zinc-900 dark:text-zinc-100 ml-2">
                              {agent.card.payment.pricingModel === 'per_call' ? t('agents.perCall') : 
                               agent.card.payment.pricingModel === 'free' ? t('agents.free') : 
                               agent.card.payment.pricingModel}
                            </span>
                          </div>
                        )}
                        {agent.card.payment.note && (
                          <div className="mt-2 p-2 bg-zinc-50 dark:bg-zinc-800 rounded text-xs text-zinc-600 dark:text-zinc-400">
                            {agent.card.payment.note}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Metadata */}
                  {agent.card.metadata && (
                    <div>
                      <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                        {t('agents.metadata')}
                      </h3>
                      <div className="text-sm">
                        <pre className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded overflow-x-auto text-xs">
                          {JSON.stringify(agent.card.metadata, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8 text-zinc-500">
                  {agent.loading ? t('agents.loading') : agent.error || t('agents.noData')}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* A2A Protocol Information */}
        <div className="mt-8 bg-white dark:bg-zinc-900 rounded-lg shadow-lg p-6 border border-zinc-200 dark:border-zinc-800">
          <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
            {t('agents.aboutA2A')}
          </h2>
          <div className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
            <p>
              <strong className="text-zinc-900 dark:text-zinc-100">A2A (Agent-to-Agent)</strong>{' '}
              {t('agents.aboutA2ADesc1')}
            </p>
            <p>
              {t('agents.aboutA2ADesc2')}{' '}
              <strong className="text-zinc-900 dark:text-zinc-100">JSON-RPC 2.0</strong>.
            </p>
            <p>
              {t('agents.learnMore')}{' '}
              <a
                href="https://a2a.plus"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                https://a2a.plus
              </a>
            </p>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

