const linkedin = require('../../social/linkedInService');

module.exports = {
  id:          'linkedin_post',
  name:        'Post to LinkedIn',
  provider:    'linkedin',
  requiresConnection: true,
  description: 'Publish a post to the connected LinkedIn member feed.',
  parameters: {
    content: { type: 'string', description: 'The text content to post.' },
  },
  async execute({ content }) {
    if (!content?.trim()) throw new Error('content is required');
    return linkedin.post(content.trim());
  },
};
