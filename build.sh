#!/bin/bash

# Docker 仓库配置
DOCKER_REGISTRY='docker.antfact.com'
DOCKER_NAMESPACE='platform'
IMAGE_NAME='xiaofei-model-monitor'

# 目标架构
PLATFORM='linux/amd64'

# 生成时间戳版本号 (格式: YYYYMMDD-HHMMSS)
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")

# 从 package.json 读取语义版本号
SEMVER=$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")

# 完整的镜像地址
FULL_IMAGE_NAME="${DOCKER_REGISTRY}/${DOCKER_NAMESPACE}/${IMAGE_NAME}"

echo "=========================================="
echo "开始构建 Docker 镜像 (x86/amd64 架构)"
echo "=========================================="
echo "镜像名称: ${FULL_IMAGE_NAME}"
echo "目标架构: ${PLATFORM}"
echo "语义版本: ${SEMVER}"
echo "时间戳版本: ${TIMESTAMP}"
echo "=========================================="

# 检查 docker buildx 是否可用
if ! sudo docker buildx version > /dev/null 2>&1; then
    echo "❌ docker buildx 不可用，请先安装 buildx"
    echo "提示: 较新版本的 Docker 已内置 buildx"
    exit 1
fi

# 创建并使用 builder 实例（如果不存在）
BUILDER_NAME="multiarch-builder"
if ! sudo docker buildx inspect ${BUILDER_NAME} > /dev/null 2>&1; then
    echo "创建 buildx builder: ${BUILDER_NAME}"
    sudo docker buildx create --name ${BUILDER_NAME} --use
else
    echo "使用已存在的 builder: ${BUILDER_NAME}"
    sudo docker buildx use ${BUILDER_NAME}
fi

# 启动 builder
sudo docker buildx inspect --bootstrap

# 构建并推送 Docker 镜像
echo "=========================================="
echo "正在构建并推送镜像 (${PLATFORM})..."
echo "=========================================="
sudo docker buildx build \
    --platform ${PLATFORM} \
    --tag "${FULL_IMAGE_NAME}:${TIMESTAMP}" \
    --tag "${FULL_IMAGE_NAME}:latest" \
    --push \
    .

if [ $? -ne 0 ]; then
    echo "❌ 镜像构建或推送失败！"
    exit 1
fi

echo "=========================================="
echo "🎉 所有操作完成！"
echo "=========================================="
echo "已推送的镜像（${PLATFORM}）："
echo "  - ${FULL_IMAGE_NAME}:${TIMESTAMP}"
echo "  - ${FULL_IMAGE_NAME}:latest"
echo "=========================================="
echo "使用方法："
echo "  docker pull ${FULL_IMAGE_NAME}:${TIMESTAMP}"
echo "  docker pull ${FULL_IMAGE_NAME}:latest"
echo "=========================================="
