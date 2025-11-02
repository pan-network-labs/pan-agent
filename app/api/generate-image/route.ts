/**
 * 智谱AI图片生成API
 * 
 * 请求方式：POST
 * 请求地址：/api/generate-image
 * 
 * 请求参数（JSON格式）：
 * {
 *   "prompt": "string" // 必需，用户输入的提示词（字符串类型）
 * }
 * 
 * 请求示例：
 * {
 *   "prompt": "一只可爱的小猫咪"
 * }
 * 
 * 响应格式（成功）：
 * {
 *   "code": 200,
 *   "msg": "success",
 *   "data": {
 *     "data": "https://..." // 生成的图片URL
 *   }
 * }
 * 
 * 响应格式（失败）：
 * {
 *   "code": 400/500,
 *   "msg": "错误信息",
 *   "data": {
 *     "data": ""
 *   }
 * }
 * 
 * 说明：
 * - 实际发送给智谱AI的prompt会自动添加前缀："异常抽象的油画："
 * - 图片尺寸固定为：1024x1024
 * - 需要配置环境变量：ZHIPUAI_API_KEY
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // 1. 解析请求体
    const body = await request.json();
    const { prompt } = body;

    // 2. 验证必需参数
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({
        code: 400,
        msg: '缺少必需的参数: prompt',
        data: { data: '' }
      }, { status: 400 });
    }

    // 3. 获取API密钥（从环境变量）
    const apiKey = process.env.ZHIPUAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        code: 500,
        msg: '未配置API密钥，请设置环境变量 ZHIPUAI_API_KEY',
        data: { data: '' }
      }, { status: 500 });
    }

    // 4. 调用智谱AI API
    // 请求参数：
    // - model: 使用cogview-3-flash模型
    // - prompt: 用户提示词 + 系统前缀"异常抽象的油画："
    // - size: 图片尺寸 1024x1024
    const response = await fetch('https://open.bigmodel.cn/api/paas/v4/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'cogview-3-flash',
        prompt: `异常抽象的油画：${prompt}`,
        size: '1024x1024',
      }),
    });

    // 5. 处理智谱AI API响应
    if (!response.ok) {
      const errorData = await response.text();
      console.error('智谱AI API错误:', errorData);
      return NextResponse.json({
        code: response.status,
        msg: '图片生成失败',
        data: { data: errorData }
      }, { status: response.status });
    }

    // 6. 解析成功响应并提取图片URL
    const data = await response.json();
    const imageUrl = data.data?.[0]?.file_url || data.data?.[0]?.url;
    
    // 返回统一格式：{ code: 200, msg: "success", data: { data: "图片URL" } }
    return NextResponse.json({
      code: 200,
      msg: 'success',
      data: { data: imageUrl }
    });
  } catch (error) {
    console.error('生成图片时发生错误:', error);
    return NextResponse.json({
      code: 500,
      msg: '服务器内部错误',
      data: { data: error instanceof Error ? error.message : '未知错误' }
    }, { status: 500 });
  }
}

