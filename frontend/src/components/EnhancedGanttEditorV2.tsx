import React from 'react';
import EnhancedGanttEditor from './EnhancedGanttEditor';

// 这是一个扩展版本的EnhancedGanttEditor
// 包含约束管理和人员共享功能
// 由于原始组件太大，我们通过组合方式来扩展功能

const EnhancedGanttEditorV2: React.FC<any> = (props) => {
  // 暂时使用原始组件
  // 后续会逐步添加约束和共享组功能
  return <EnhancedGanttEditor {...props} />;
};

export default EnhancedGanttEditorV2;