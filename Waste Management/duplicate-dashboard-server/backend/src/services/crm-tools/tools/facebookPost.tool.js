const facebook = require('../../social/facebookService');

module.exports = {
  id:          'facebook_post',
  name:        'Post to Facebook',
  provider:    'facebook',
  requiresConnection: true,
  description: 'Publish a post to the connected Facebook Page.',
  parameters: {
    content: { type: 'string', description: 'The text content to post.' },
  },
  async execute({ content }) {
    if (!content?.trim()) throw new Error('content is required');
    return facebook.post(content.trim());
  },
};
