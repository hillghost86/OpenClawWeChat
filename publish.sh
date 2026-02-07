#!/bin/bash
# NPM 发布脚本
# 用法: ./publish.sh [patch|minor|major|beta]

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
    echo -e "${GREEN}✅${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}❌${NC} $1"
}

# 检查命令
check_command() {
    if ! command -v "$1" &> /dev/null; then
        print_error "$1 未安装"
        exit 1
    fi
}

# 检查 git 状态
check_git_status() {
    if [ -d .git ]; then
        if ! git diff-index --quiet HEAD --; then
            print_warning "Git 工作区有未提交的更改"
            read -p "是否继续？(y/N): " confirm
            if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
                exit 1
            fi
        fi
    fi
}

# 检查 git remote
check_git_remote() {
    if [ -d .git ]; then
        if ! git remote get-url origin &> /dev/null; then
            print_warning "未配置 git remote origin"
            return 1
        fi
        return 0
    fi
    return 1
}

# 检查 npm 登录状态
check_npm_login() {
    if ! npm whoami &> /dev/null; then
        print_error "未登录 npm，请先运行: npm login"
        exit 1
    fi
    print_success "已登录 npm: $(npm whoami)"
}

# 预览将要发布的文件
preview_files() {
    print_info "预览将要发布的文件..."
    npm pack --dry-run 2>&1 | grep -E "^(npm notice|package\.json|index\.ts|src/|openclaw\.plugin\.json|README|CONFIG|EXAMPLE|INSTALL)" || true
    echo ""
}


# 同步版本号到所有文件
sync_version() {
    local new_version="$1"
    
    print_info "同步版本号到所有文件..."
    
    # 1. 更新 openclaw.plugin.json
    if [ -f "openclaw.plugin.json" ]; then
        node -e "
        const fs = require('fs');
        const file = 'openclaw.plugin.json';
        const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
        data.version = '$new_version';
        fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf-8');
        "
        print_success "已更新 openclaw.plugin.json: $new_version"
    fi
    
    # 2. 更新 src/constants.ts
    if [ -f "src/constants.ts" ]; then
        # 使用 sed 更新 PLUGIN_VERSION（兼容 macOS 和 Linux）
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' "s/export const PLUGIN_VERSION = \".*\";/export const PLUGIN_VERSION = \"$new_version\";/" src/constants.ts
        else
            # Linux
            sed -i "s/export const PLUGIN_VERSION = \".*\";/export const PLUGIN_VERSION = \"$new_version\";/" src/constants.ts
        fi
        print_success "已更新 src/constants.ts: $new_version"
    fi
}

# 更新版本号
update_version() {
    local version_type="$1"
    
    if [ -z "$version_type" ]; then
        echo "选择版本更新类型:"
        echo "  1) patch (1.0.0 -> 1.0.1) - 补丁版本"
        echo "  2) minor (1.0.0 -> 1.1.0) - 次要版本"
        echo "  3) major (1.0.0 -> 2.0.0) - 主要版本"
        echo "  4) beta (1.0.0 -> 1.0.1-beta.0) - 测试版本"
        echo ""
        read -p "请选择 (1-4): " choice
        
        case $choice in
            1) version_type="patch" ;;
            2) version_type="minor" ;;
            3) version_type="major" ;;
            4) version_type="beta" ;;
            *)
                print_error "无效选择"
                exit 1
                ;;
        esac
    fi
    
    if [ "$version_type" = "beta" ]; then
        print_info "创建 beta 版本..."
        # 获取当前版本并添加 beta 标签
        current_version=$(node -p "require('./package.json').version")
        npm version prerelease --preid=beta --no-git-tag-version
    else
        print_info "更新版本: $version_type"
        npm version "$version_type" --no-git-tag-version
    fi
    
    new_version=$(node -p "require('./package.json').version")
    print_success "package.json 版本已更新: $new_version"
    
    # 同步版本号到其他文件
    sync_version "$new_version"
    
    print_success "所有文件版本已同步: $new_version"
}

# 发布到 npm
publish_to_npm() {
    local tag="$1"
    
    print_info "发布到 npm..."
    
    if [ "$tag" = "beta" ]; then
        npm publish --access public --tag beta
        print_success "已发布 beta 版本到 npm"
    else
        npm publish --access public
        print_success "已发布到 npm"
    fi
    
    # 验证发布
    package_name=$(node -p "require('./package.json').name")
    published_version=$(node -p "require('./package.json').version")
    
    print_info "验证发布..."
    sleep 2
    if npm view "$package_name@$published_version" version &> /dev/null; then
        print_success "发布验证成功: $package_name@$published_version"
    else
        print_warning "发布验证失败，可能需要等待几秒钟"
    fi
}

# 提交版本变更到 git
commit_version_changes() {
    if [ ! -d .git ]; then
        return 0
    fi
    
    local version=$(node -p "require('./package.json').version")
    local commit_all="${1:-false}"  # 是否提交所有更改
    local custom_message="${2:-}"    # 自定义 commit 消息
    
    # 检查是否有变更需要提交
    local changed_files=""
    if [ "$commit_all" = "true" ]; then
        # 检查所有未提交的更改
        if git diff --quiet HEAD -- && git diff --cached --quiet; then
            print_info "没有需要提交的更改"
            return 0
        fi
        changed_files="所有更改"
    else
        # 只检查版本相关文件
        if git diff --quiet HEAD -- package.json openclaw.plugin.json src/constants.ts 2>/dev/null; then
            print_info "没有版本变更需要提交"
            return 0
        fi
        changed_files="版本文件"
    fi
    
    print_info "提交 $changed_files..."
    
    # 添加变更的文件
    if [ "$commit_all" = "true" ]; then
        git add -A
    else
        git add package.json openclaw.plugin.json src/constants.ts
    fi
    
    # 构建 commit 消息
    local commit_msg
    if [ -n "$custom_message" ]; then
        commit_msg="$custom_message"
    else
        commit_msg="chore: bump version to $version"
    fi
    
    # 提交
    git commit -m "$commit_msg" || {
        print_warning "提交失败，可能没有变更"
        return 0
    }
    
    print_success "已提交: $commit_msg"
}

# 创建并推送 git tag
create_and_push_git_tag() {
    if [ ! -d .git ]; then
        return 0
    fi
    
    if ! check_git_remote; then
        print_warning "未配置 git remote，跳过 tag 推送"
        return 0
    fi
    
    local version=$(node -p "require('./package.json').version")
    local tag="v$version"
    
    print_info "创建 git tag: $tag"
    
    if git rev-parse "$tag" &> /dev/null; then
        print_warning "Tag $tag 已存在，跳过创建"
    else
        git tag "$tag"
        print_success "Git tag 已创建: $tag"
    fi
    
    # 推送代码和 tag
    print_info "推送到 GitHub..."
    
    # 推送代码
    if git push origin HEAD 2>/dev/null; then
        print_success "代码已推送到 GitHub"
    else
        print_warning "代码推送失败，请手动推送"
    fi
    
    # 推送 tag
    if git push origin "$tag" 2>/dev/null; then
        print_success "Tag $tag 已推送到 GitHub"
    else
        print_warning "Tag 推送失败，请手动运行: git push origin $tag"
    fi
}

# 仅推送到 GitHub（不更新版本，不发布 npm）
push_to_github_only() {
    if [ ! -d .git ]; then
        print_error "当前目录不是 git 仓库"
        exit 1
    fi
    
    if ! check_git_remote; then
        print_error "未配置 git remote origin"
        exit 1
    fi
    
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║   推送到 GitHub                      ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
    echo ""
    
    # 检查是否有未提交的更改
    if ! git diff --quiet HEAD -- 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
        print_warning "检测到有未提交的更改"
        read -p "是否先提交所有更改？(y/N): " commit_choice
        if [[ "$commit_choice" =~ ^[Yy]$ ]]; then
            read -p "请输入 commit 消息（留空使用默认）: " commit_msg
            if [ -z "$commit_msg" ]; then
                commit_msg="chore: update files"
            fi
            
            git add -A
            git commit -m "$commit_msg" || {
                print_error "提交失败"
                exit 1
            }
            print_success "已提交更改"
        else
            print_info "跳过提交，直接推送已有提交"
        fi
        echo ""
    fi
    
    # 检查是否有未推送的提交
    local ahead=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo "0")
    if [ "$ahead" = "0" ]; then
        print_info "没有需要推送的提交"
    else
        print_info "有 $ahead 个提交需要推送"
    fi
    
    # 推送代码
    print_info "推送到 GitHub..."
    if git push origin HEAD 2>/dev/null; then
        print_success "代码已推送到 GitHub"
    else
        print_error "代码推送失败"
        exit 1
    fi
    
    # 检查是否有未推送的 tag
    local current_version=$(node -p "require('./package.json').version")
    local tag="v$current_version"
    
    if git rev-parse "$tag" &> /dev/null; then
        local tag_exists_remote=$(git ls-remote --tags origin "$tag" 2>/dev/null | wc -l | tr -d ' ')
        if [ "$tag_exists_remote" = "0" ]; then
            print_info "推送 tag: $tag"
            if git push origin "$tag" 2>/dev/null; then
                print_success "Tag $tag 已推送到 GitHub"
            else
                print_warning "Tag 推送失败，请手动运行: git push origin $tag"
            fi
        else
            print_info "Tag $tag 已存在于远程仓库"
        fi
    fi
    
    echo ""
    print_success "推送完成！"
    echo ""
}

# 主函数
main() {
    local version_type=""
    local tag="latest"
    local commit_all=false
    local commit_message=""
    
    # 检查是否是 github 命令
    if [ "$1" = "github" ]; then
        push_to_github_only
        return 0
    fi
    
    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            patch|minor|major|beta)
                version_type="$1"
                if [ "$version_type" = "beta" ]; then
                    tag="beta"
                fi
                shift
                ;;
            --commit-all|-a)
                commit_all=true
                shift
                ;;
            --commit-message|-m)
                if [ -z "$2" ]; then
                    print_error "--commit-message 需要指定消息内容"
                    exit 1
                fi
                commit_message="$2"
                shift 2
                ;;
            *)
                # 如果不是已知参数，可能是版本类型（向后兼容）
                if [[ "$1" =~ ^(patch|minor|major|beta)$ ]]; then
                    version_type="$1"
                    if [ "$version_type" = "beta" ]; then
                        tag="beta"
                    fi
                else
                    print_error "未知参数: $1"
                    echo "使用 --help 查看帮助信息"
                    exit 1
                fi
                shift
                ;;
        esac
    done
    
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║   NPM 发布脚本                       ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
    echo ""
    
    # 检查前置条件
    check_command npm
    check_command node
    check_npm_login
    check_git_status
    
    # 显示当前版本号
    current_version=$(node -p "require('./package.json').version")
    print_info "当前版本: $current_version"
    echo ""
    
    # 预览文件
    preview_files
    read -p "确认发布这些文件？(y/N): " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        exit 0
    fi
    
    # 更新版本（先更新版本号）
    update_version "$version_type"
    
    # 显示更新后的版本号
    new_version=$(node -p "require('./package.json').version")
    print_info "新版本: $new_version"
    echo ""
    
    # 如果没有指定 commit 消息，询问用户
    if [ -z "$commit_message" ] && [ -d .git ]; then
        echo "Commit 选项:"
        echo "  1) 使用默认消息: chore: bump version to $new_version"
        echo "  2) 自定义 commit 消息"
        echo "  3) 跳过 commit（稍后手动提交）"
        echo ""
        read -p "请选择 (1-3，默认 1): " commit_choice
        commit_choice=${commit_choice:-1}
        
        case $commit_choice in
            2)
                read -p "请输入 commit 消息: " commit_message
                if [ -z "$commit_message" ]; then
                    print_warning "未输入消息，使用默认消息"
                    commit_message=""
                fi
                ;;
            3)
                print_info "跳过 commit，稍后请手动提交"
                commit_message="SKIP"
                ;;
            *)
                # 使用默认消息
                commit_message=""
                ;;
        esac
        echo ""
    fi
    
    # 如果没有指定 --commit-all，询问是否提交所有更改
    if [ "$commit_all" = "false" ] && [ -d .git ]; then
        if ! git diff --quiet HEAD -- 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
            echo "检测到有其他未提交的更改"
            read -p "是否提交所有更改（不仅仅是版本文件）？(y/N): " commit_all_choice
            if [[ "$commit_all_choice" =~ ^[Yy]$ ]]; then
                commit_all=true
            fi
            echo ""
        fi
    fi
    
    # 提交版本变更（除非用户选择跳过）
    if [ "$commit_message" != "SKIP" ]; then
        commit_version_changes "$commit_all" "$commit_message"
    fi
    
    # 先推送到 GitHub（确保代码安全保存）
    create_and_push_git_tag
    
    # 再发布到 npm
    publish_to_npm "$tag"
    
    # 完成
    echo ""
    print_success "发布完成！"
    echo ""
    print_info "已完成："
    echo "  ✅ 版本号已更新并同步到所有文件"
    echo "  ✅ 版本变更已提交到 git"
    echo "  ✅ 代码和 tag 已推送到 GitHub"
    echo "  ✅ 已发布到 npm"
    echo ""
    print_info "验证："
    echo "  1. 查看 npm 版本:"
    echo "     ${GREEN}npm view openclawwechat version${NC}"
    echo ""
    echo "  2. 测试安装:"
    echo "     ${GREEN}openclaw plugins install openclawwechat${NC}"
    echo ""
}

# 显示帮助
show_help() {
    cat << EOF
NPM 发布脚本

用法:
  ./publish.sh [命令/版本类型] [选项]

命令:
  github                 仅推送到 GitHub（不更新版本，不发布 npm）

版本类型:
  patch   更新补丁版本 (1.0.0 -> 1.0.1)
  minor   更新次要版本 (1.0.0 -> 1.1.0)
  major   更新主要版本 (1.0.0 -> 2.0.0)
  beta    创建 beta 版本 (1.0.0 -> 1.0.1-beta.0)
  (不指定则交互式选择)

选项:
  -a, --commit-all           提交所有更改（不仅仅是版本文件）
  -m, --commit-message MSG  自定义 commit 消息
  -h, --help                显示帮助信息

示例:
  ./publish.sh github                  # 仅推送到 GitHub
  ./publish.sh patch                    # 发布补丁版本
  ./publish.sh minor                    # 发布次要版本
  ./publish.sh beta                     # 发布 beta 版本
  ./publish.sh                          # 交互式选择版本类型
  ./publish.sh patch --commit-all       # 发布并提交所有更改
  ./publish.sh patch -m "更新版本"      # 使用自定义 commit 消息
  ./publish.sh patch -a -m "发布 v1.0.1" # 提交所有更改并使用自定义消息

EOF
}

# 检查是否需要显示帮助
for arg in "$@"; do
    if [ "$arg" = "--help" ] || [ "$arg" = "-h" ]; then
        show_help
        exit 0
    fi
done

main "$@"
