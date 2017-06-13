import {SvgFactory} from "../../svgFactory";
import {GridOptionsWrapper} from "../../gridOptionsWrapper";
import {ExpressionService} from "../../expressionService";
import {EventService} from "../../eventService";
import {Utils as _} from "../../utils";
import {Autowired, Context} from "../../context/context";
import {Component} from "../../widgets/component";
import {ICellRenderer, ICellRendererParams} from "./iCellRenderer";
import {RowNode} from "../../entities/rowNode";
import {CellRendererService} from "../cellRendererService";
import {CheckboxSelectionComponent} from "../checkboxSelectionComponent";
import {ColumnController} from "../../columnController/columnController";
import {Column} from "../../entities/column";
import {RefSelector} from "../../widgets/componentAnnotations";
import {GroupNameInfoParams, GroupValueService} from "../../groupValueService";

let svgFactory = SvgFactory.getInstance();

export interface GroupCellRendererParams extends ICellRendererParams{
    restrictToOneGroup: boolean,
    pinned:string,
    padding:number,
    suppressPadding:boolean,
    innerRenderer:any,
    footerValueGetter:any,
    suppressCount:boolean,
    checkbox:any,
    keyMap:{[id:string]:string},
    scope:any,
    actualValue:string
}

export class GroupCellRenderer extends Component implements ICellRenderer {

    private static TEMPLATE =
        '<span>' +
         '<span class="ag-group-expanded" ref="eExpanded"></span>' +
         '<span class="ag-group-contracted" ref="eContracted"></span>' +
         '<span class="ag-group-checkbox" ref="eCheckbox"></span>' +
         '<span class="ag-group-value" ref="eValue"></span>' +
         '<span class="ag-group-child-count" ref="eChildCount"></span>' +
        '</span>';

    @Autowired('gridOptionsWrapper') private gridOptionsWrapper: GridOptionsWrapper;
    @Autowired('expressionService') private expressionService: ExpressionService;
    @Autowired('eventService') private eventService: EventService;
    @Autowired('cellRendererService') private cellRendererService: CellRendererService;
    @Autowired('context') private context: Context;
    @Autowired('columnController') private columnController: ColumnController;
    @Autowired('groupValueService') private groupValueService: GroupValueService;

    @RefSelector('eExpanded') private eExpanded: HTMLElement;
    @RefSelector('eContracted') private eContracted: HTMLElement;
    @RefSelector('eCheckbox') private eCheckbox: HTMLElement;
    @RefSelector('eValue') private eValue: HTMLElement;
    @RefSelector('eChildCount') private eChildCount: HTMLElement;

    private originalParams: any;
    private params: GroupCellRendererParams;
    private nodeWasSwapped: boolean;

    constructor() {
        super(GroupCellRenderer.TEMPLATE);
    }

    public init(params: GroupCellRendererParams): void {
        this.setParams(params);

        let groupKeyMismatch = this.isGroupKeyMismatch();
        let embeddedRowMismatch = this.embeddedRowMismatch();
        if (groupKeyMismatch || embeddedRowMismatch) { return; }

        this.setupComponents();
    }

    public setParams(params: GroupCellRendererParams): void {
        if (this.gridOptionsWrapper.isGroupHideOpenParents()) {
            let rowGroupColumn = this.getRowGroupColumn(params);
            let nodeToSwapIn = this.isFirstChildOfFirstChild(params.node, rowGroupColumn);
            this.nodeWasSwapped = _.exists(nodeToSwapIn);
            if (this.nodeWasSwapped) {
                let newParams = <any> {};
                _.assign(newParams, params);
                newParams.node = nodeToSwapIn;
                this.params = newParams;
            } else {
                this.params = params;
            }
        } else {
            this.nodeWasSwapped = false;
            this.params = params;
        }
        this.setValuesInParams(this.params);
        this.originalParams = this.params;
    }

    private setValuesInParams(toSetIn: GroupCellRendererParams) {
        let node:RowNode = toSetIn.node.group ? toSetIn.node : toSetIn.node.parent;
        let groupNameParams: GroupNameInfoParams = {
            rowGroupIndex: node.rowGroupIndex,
            column: toSetIn.column,
            rowIndex: node.rowIndex,
            scope: null,
            keyMap: {}
        };
        this.groupValueService.assignToParams(this.params, node, groupNameParams);
    }

    private setupComponents(): void {
        this.addExpandAndContract();
        this.addCheckboxIfNeeded();
        this.addValueElement();
        this.addPadding();
    }

    private isFirstChildOfFirstChild(rowNode: RowNode, rowGroupColumn: Column): RowNode {
        let currentRowNode = rowNode;

        // if we are hiding groups, then if we are the first child, of the first child,
        // all the way up to the column we are interested in, then we show the group cell.

        let isCandidate = true;
        let foundFirstChildPath = false;
        let nodeToSwapIn: RowNode;

        while (isCandidate && !foundFirstChildPath) {

            let parentRowNode = currentRowNode.parent;
            let firstChild = _.exists(parentRowNode) && currentRowNode.childIndex === 0;

            if (firstChild) {
                if (parentRowNode.rowGroupColumn === rowGroupColumn) {
                    foundFirstChildPath = true;
                    nodeToSwapIn = parentRowNode;
                }
            } else {
                isCandidate = false;
            }

            currentRowNode = parentRowNode;
        }

        return foundFirstChildPath ? nodeToSwapIn : null;
    }

    private getRowGroupColumn(params: any): Column {
        // if we are using the auto-group, then the auto-group passes the
        // original rowGroupColumn
        if (params.originalRowGroupColumn) {
            return params.originalRowGroupColumn;
        } else {
            return params.column;
        }
    }

    private isGroupKeyMismatch(): boolean {
        // if the user only wants to show details for one group in this column,
        // then the group key here says which column we are interested in.

        let restrictToOneGroup = this.params.restrictToOneGroup;

        let skipCheck = this.nodeWasSwapped || !restrictToOneGroup;
        if (skipCheck) { return false; }

        let columnGroup = this.getRowGroupColumn(this.params);
        let rowGroup = this.params.node.rowGroupColumn;

        return columnGroup !== rowGroup;
    }

    // if we are doing embedded full width rows, we only show the renderer when
    // in the body, or if pinning in the pinned section, or if pinning and RTL,
    // in the right section. otherwise we would have the cell repeated in each section.
    private embeddedRowMismatch(): boolean {
        if (this.gridOptionsWrapper.isEmbedFullWidthRows()) {

            let pinnedLeftCell = this.params.pinned === Column.PINNED_LEFT;
            let pinnedRightCell = this.params.pinned === Column.PINNED_RIGHT;
            let bodyCell = !pinnedLeftCell && !pinnedRightCell;

            if (this.gridOptionsWrapper.isEnableRtl()) {
                if (this.columnController.isPinningLeft()) {
                    return !pinnedRightCell;
                } else {
                    return !bodyCell;
                }
            } else {
                if (this.columnController.isPinningLeft()) {
                    return !pinnedLeftCell;
                } else {
                    return !bodyCell;
                }
            }
        } else {
            return false;
        }
    }

    private setPadding(): void {
        let params = this.params;
        let rowNode: RowNode = params.node;

        let paddingPx: number;

        // never any padding on top level nodes
        if (rowNode.uiLevel<=0) {
            paddingPx = 0;
        } else {
            let paddingFactor: number = (params.padding >= 0) ? params.padding : 10;
            paddingPx = rowNode.uiLevel * paddingFactor;

            let reducedLeafNode = this.columnController.isPivotMode() && params.node.leafGroup;
            if (rowNode.footer) {
                paddingPx += 15;
            } else if (!rowNode.isExpandable() || reducedLeafNode) {
                paddingPx += 10;
            }
        }

        if (this.gridOptionsWrapper.isEnableRtl()) {
            // if doing rtl, padding is on the right
            this.getGui().style.paddingRight = paddingPx + 'px';
        } else {
            // otherwise it is on the left
            this.getGui().style.paddingLeft = paddingPx + 'px';
        }
    }

    private addPadding(): void {
        let params = this.params;
        // only do this if an indent - as this overwrites the padding that
        // the theme set, which will make things look 'not aligned' for the
        // first group level.
        let node: RowNode = params.node;
        let suppressPadding = params.suppressPadding;

        if (!suppressPadding) {
            this.addDestroyableEventListener(node, RowNode.EVENT_UI_LEVEL_CHANGED, this.setPadding.bind(this));
            this.setPadding();
        }
    }

    private addValueElement(): void {
        let params = this.params;
        let rowNode = this.params.node;
        if (params.innerRenderer) {
            this.createFromInnerRenderer();
        } else if (rowNode.footer) {
            this.createFooterCell();
        } else if (rowNode.group) {
            this.createGroupCell();
            this.addChildCount();
        } else {
            this.createLeafCell();
        }
    }

    private createFromInnerRenderer(): void {
        let innerComponent = this.cellRendererService.useCellRenderer(this.params.innerRenderer, this.eValue, this.params);
        this.addDestroyFunc( ()=> {
            if (innerComponent && innerComponent.destroy) {
                innerComponent.destroy();
            }
        });
    }

    private createFooterCell(): void {
        let footerValue: string;
        let groupName = this.params.value;
        let footerValueGetter = this.params.footerValueGetter;
        if (footerValueGetter) {
            // params is same as we were given, except we set the value as the item to display
            let paramsClone: any = _.cloneObject(this.params);
            paramsClone.value = groupName;
            if (typeof footerValueGetter === 'function') {
                footerValue = footerValueGetter(paramsClone);
            } else if (typeof footerValueGetter === 'string') {
                footerValue = this.expressionService.evaluate(footerValueGetter, paramsClone);
            } else {
                console.warn('ag-Grid: footerValueGetter should be either a function or a string (expression)');
            }
        } else {
            footerValue = 'Total ' + groupName;
        }

        this.eValue.innerHTML = footerValue;
    }

    private createGroupCell(): void {
        let params = this.params;
        // pull out the column that the grouping is on
        let rowGroupColumns = this.params.columnApi.getRowGroupColumns();

        // if we are using in memory grid grouping, then we try to look up the column that
        // we did the grouping on. however if it is not possible (happens when user provides
        // the data already grouped) then we just the current col, ie use cellRenderer of current col
        let columnOfGroupedCol = rowGroupColumns[params.node.rowGroupIndex];
        if (_.missing(columnOfGroupedCol)) {
            columnOfGroupedCol = params.column;
        }

        let groupedColCellRenderer = columnOfGroupedCol.getCellRenderer();

        // reuse the params but change the value
        if (typeof groupedColCellRenderer === 'function') {
            let colDefOfGroupedCol = columnOfGroupedCol.getColDef();
            let groupedColCellRendererParams = colDefOfGroupedCol ? colDefOfGroupedCol.cellRendererParams : null;

            // because we are talking about the different column to the original, any user provided params
            // are for the wrong column, so need to copy them in again.
            if (groupedColCellRendererParams) {
                _.assign(params, groupedColCellRenderer);
            }

            params.value = this.params.value;
            params.valueFormatted = this.params.valueFormatted;
            params.actualValue = this.params.actualValue;

            this.cellRendererService.useCellRenderer(colDefOfGroupedCol.cellRenderer, this.eValue, params);
        } else {
            if (_.exists(this.params.actualValue) && this.params.actualValue !== '') {
                this.eValue.appendChild(document.createTextNode(this.params.actualValue));
            }
        }
    }

    private addChildCount(): void {

        // only include the child count if it's included, eg if user doing custom aggregation,
        // then this could be left out, or set to -1, ie no child count
        if (this.params.suppressCount) { return; }

        this.addDestroyableEventListener(this.params.node, RowNode.EVENT_ALL_CHILDREN_COUNT_CELL_CHANGED, this.updateChildCount.bind(this));

        // filtering changes the child count, so need to cater for it
        this.updateChildCount();
    }

    private updateChildCount(): void {
        let allChildrenCount = this.params.node.allChildrenCount;
        let text = allChildrenCount >= 0 ? `(${allChildrenCount})` : '';
        this.eChildCount.innerHTML = text;
    }

    private createLeafCell(): void {
        if (_.exists(this.params.actualValue)) {
            this.eValue.innerHTML = this.params.actualValue;
        }
    }

    private isUserWantsSelected(): boolean {
        let paramsCheckbox = this.params.checkbox;
        if (typeof paramsCheckbox === 'function') {
            return paramsCheckbox(this.params);
        } else {
            return paramsCheckbox === true;
        }
    }

    private addCheckboxIfNeeded(): void {
        let rowNode = this.params.node;
        let checkboxNeeded = this.isUserWantsSelected()
                // footers cannot be selected
                && !rowNode.footer
                // floating rows cannot be selected
                && !rowNode.floating
                // flowers cannot be selected
                && !rowNode.flower;
        if (checkboxNeeded) {
            let cbSelectionComponent = new CheckboxSelectionComponent();
            this.context.wireBean(cbSelectionComponent);
            cbSelectionComponent.init({rowNode: rowNode});
            this.eCheckbox.appendChild(cbSelectionComponent.getGui());
            this.addDestroyFunc( ()=> cbSelectionComponent.destroy() );
        }
    }

    private addExpandAndContract(): void {
        let params = this.params;
        let eGroupCell: HTMLElement = params.eGridCell;
        let eExpandedIcon = _.createIconNoSpan('groupExpanded', this.gridOptionsWrapper, null, svgFactory.createGroupContractedIcon);
        let eContractedIcon = _.createIconNoSpan('groupContracted', this.gridOptionsWrapper, null, svgFactory.createGroupExpandedIcon);
        this.eExpanded.appendChild(eExpandedIcon);
        this.eContracted.appendChild(eContractedIcon);

        let expandOrContractListener = this.onExpandOrContract.bind(this);
        this.addDestroyableEventListener(this.eExpanded, 'click', expandOrContractListener);
        this.addDestroyableEventListener(this.eContracted, 'click', expandOrContractListener);

        // if editing groups, then double click is to start editing
        if (!this.gridOptionsWrapper.isEnableGroupEdit()) {
            this.addDestroyableEventListener(eGroupCell, 'dblclick', expandOrContractListener);
        }

        // expand / contract as the user hits enter
        this.addDestroyableEventListener(eGroupCell, 'keydown', this.onKeyDown.bind(this));
        this.addDestroyableEventListener(params.node, RowNode.EVENT_EXPANDED_CHANGED, this.showExpandAndContractIcons.bind(this));
        this.showExpandAndContractIcons();
    }

    private onKeyDown(event: KeyboardEvent): void {
        // if (_.isKeyPressed(event, Constants.KEY_ENTER)) {
            // if (! this.params.node.isCellEditable()){
            //     this.onExpandOrContract();
            //     event.preventDefault();
            // }
        // }
    }

    public onExpandOrContract(): void {
        let rowNode = this.params.node;

        rowNode.setExpanded(!rowNode.expanded);

        if (this.gridOptionsWrapper.isGroupIncludeFooter()) {
            this.params.api.refreshRows([rowNode]);
        }
    }

    private showExpandAndContractIcons(): void {
        let rowNode = this.params.node;

        let reducedLeafNode = this.columnController.isPivotMode() && rowNode.leafGroup;

        let expandable = rowNode.isExpandable() && !rowNode.footer && !reducedLeafNode;
        if (expandable) {
            // if expandable, show one based on expand state
            _.setVisible(this.eContracted, !rowNode.expanded);
            _.setVisible(this.eExpanded, rowNode.expanded);
        } else {
            // it not expandable, show neither
            _.setVisible(this.eExpanded, false);
            _.setVisible(this.eContracted, false);
        }
    }


    public getOriginalParams(): any {
        return this.originalParams;
    }
}
